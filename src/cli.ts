import { CertificateStore } from "./db.ts";
import { extractCertificateMetadata, readPfxFile } from "./certificates.ts";
import { startServer } from "./server.ts";

type ParsedArgs = {
  command: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(args: string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i += 1) {
    const item = args[i];
    if (!item.startsWith("--")) {
      command.push(item);
      continue;
    }

    const [key, directValue] = item.slice(2).split("=");
    if (directValue !== undefined) {
      flags[key] = directValue;
      continue;
    }

    const next = args[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }

  return { command, flags };
}

function requireString(flags: Record<string, string | boolean>, name: string): string {
  const value = flags[name];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing required flag: --${name}`);
  }
  return value;
}

function getDbPath(flags: Record<string, string | boolean>) {
  return typeof flags.db === "string" ? flags.db : undefined;
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);
  const [group, action] = command;

  if (group === "serve") {
    const port = typeof flags.port === "string" ? Number(flags.port) : 8800;
    const host = typeof flags.host === "string" ? flags.host : "127.0.0.1";
    const dbPath = getDbPath(flags);

    const { server } = startServer({ port, host, dbPath });
    console.log(`pje-officer listening at http://${server.hostname}:${server.port}/pjeOffice/`);
    return;
  }

  if (group !== "cert") {
    console.log(`Usage:
  bun run src/index.ts serve [--host 127.0.0.1] [--port 8800] [--db ./data/pje-officer.sqlite]
  bun run src/index.ts cert add --name NAME --file CERT.pfx --password PASS [--db PATH]
  bun run src/index.ts cert list [--db PATH]
  bun run src/index.ts cert update --id N [--name NAME] [--file CERT.pfx] [--password PASS] [--db PATH]
  bun run src/index.ts cert remove --id N [--db PATH]`);
    return;
  }

  const store = new CertificateStore(getDbPath(flags));

  try {
    if (action === "list") {
      const records = store.list().map((item) => ({
        id: item.id,
        name: item.name,
        subject: item.subject,
        issuer: item.issuer,
        validFrom: item.validFrom,
        validTo: item.validTo,
      }));
      console.table(records);
      return;
    }

    if (action === "add") {
      const name = requireString(flags, "name");
      const filePath = requireString(flags, "file");
      const password = requireString(flags, "password");
      const pfx = await readPfxFile(filePath);
      const metadata = await extractCertificateMetadata(pfx, password);
      const created = store.create({ name, pfx, password, ...metadata });
      console.log(`Certificate added with id=${created.id}`);
      return;
    }

    if (action === "update") {
      const id = Number(requireString(flags, "id"));
      const update: any = {};

      if (typeof flags.name === "string") update.name = flags.name;
      if (typeof flags.password === "string") update.password = flags.password;
      if (typeof flags.file === "string") {
        const pfx = await readPfxFile(flags.file);
        const password = typeof update.password === "string"
          ? update.password
          : store.findById(id)?.password;

        if (!password) {
          throw new Error("Password is required to update certificate file");
        }

        const metadata = await extractCertificateMetadata(pfx, password);
        Object.assign(update, { pfx, ...metadata });
      }

      const updated = store.update(id, update);
      if (!updated) {
        throw new Error("Certificate not found");
      }
      console.log(`Certificate updated: id=${updated.id}`);
      return;
    }

    if (action === "remove") {
      const id = Number(requireString(flags, "id"));
      const removed = store.remove(id);
      if (!removed) {
        throw new Error("Certificate not found");
      }
      console.log(`Certificate removed: id=${id}`);
      return;
    }

    throw new Error(`Unknown cert action: ${action ?? ""}`);
  } finally {
    store.close();
  }
}
