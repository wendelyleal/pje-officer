import type { Server } from "bun";
import { CertificateStore, type CertificateRecord, type UpdateCertificateInput } from "./db.ts";
import { extractCertificateMetadata, isCertificateValidNow } from "./certificates.ts";

const SUCCESS_GIF = Buffer.from("R0lGODlhAQABAPAAAEz/AAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
const FAIL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAABHNCSVQICAgIfAhkiAAAABFJREFUCJlj/M/A8J+BgYEBAA0FAgD+6nhnAAAAAElFTkSuQmCC", "base64");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Private-Network": "true",
  "Access-Control-Allow-Methods": "GET, OPTIONS, POST, PUT, DELETE",
  "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept, Authorization",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function readErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "Request failed";
}

function parseTask(url: URL) {
  const raw = url.searchParams.get("r");
  if (!raw) return null;
  const envelope = JSON.parse(raw);
  const task = typeof envelope.tarefa === "string" ? JSON.parse(envelope.tarefa) : envelope.tarefa;
  return {
    envelope,
    task,
    taskId: String(envelope.tarefaId ?? ""),
  };
}

function toPublicCertificate(record: CertificateRecord) {
  return {
    id: record.id,
    name: record.name,
    subject: record.subject,
    issuer: record.issuer,
    validFrom: record.validFrom,
    validTo: record.validTo,
    isCurrentlyValid: isCertificateValidNow(record.validFrom, record.validTo),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function readBody(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return req.json();
  }
  return {};
}

export type StartServerOptions = {
  port?: number;
  host?: string;
  dbPath?: string;
};

export function startServer(options: StartServerOptions = {}): { server: Server; store: CertificateStore } {
  const store = new CertificateStore(options.dbPath);

  const server = Bun.serve({
    hostname: options.host ?? "127.0.0.1",
    port: options.port ?? 8800,
    idleTimeout: 120,
    fetch: async (req) => {
      const url = new URL(req.url);
      const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;

      if (req.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      if (path === "/api/certificates/") {
        if (req.method === "GET") {
          return withCors(json(store.list().map(toPublicCertificate)));
        }

        if (req.method === "POST") {
          try {
            const body = await readBody(req) as { name: string; password: string; pfxBase64: string };
            const pfx = Buffer.from(body.pfxBase64, "base64");
            const metadata = await extractCertificateMetadata(pfx, body.password);
            const created = store.create({
              name: body.name,
              pfx,
              password: body.password,
              ...metadata,
            });
            return withCors(json(toPublicCertificate(created), 201));
          } catch (error) {
            return withCors(json({ error: readErrorMessage(error) }, 400));
          }
        }
      }

      const certMatch = path.match(/^\/api\/certificates\/(\d+)\/$/);
      if (certMatch) {
        const id = Number(certMatch[1]);

        if (req.method === "DELETE") {
          const removed = store.remove(id);
          return withCors(json({ success: removed }));
        }

        if (req.method === "PUT") {
          try {
            const body = await readBody(req) as { name?: string; password?: string; pfxBase64?: string };
            const update: UpdateCertificateInput = { name: body.name, password: body.password };

            if (body.pfxBase64) {
              const pfx = Buffer.from(body.pfxBase64, "base64");
              const metadata = await extractCertificateMetadata(pfx, body.password ?? store.findById(id)?.password ?? "");
              Object.assign(update, { pfx, ...metadata });
            }

            const updated = store.update(id, update);
            if (!updated) {
              return withCors(json({ error: "Certificate not found" }, 404));
            }
            return withCors(json(toPublicCertificate(updated)));
          } catch (error) {
            return withCors(json({ error: readErrorMessage(error) }, 400));
          }
        }
      }

      if (path === "/pjeOffice/") {
        if (req.method === "POST") {
          return withCors(json({ success: true }));
        }
        return withCors(new Response(SUCCESS_GIF, { status: 200, headers: { "content-type": "image/gif" } }));
      }

      if (path === "/pjeOffice/versao/") {
        return withCors(json({ versao: "2.0.0-pje-officer", nome: "pje-officer" }));
      }

      if (path === "/pjeOffice/logout/" || path === "/pjeOffice/shutdown/") {
        return withCors(json({ success: true }));
      }

      if (path === "/pjeOffice/requisicao/") {
        try {
          const parsed = parseTask(url);
          if (!parsed) {
            return withCors(json({ success: false, error: "Missing task payload" }, 400));
          }

          const all = store.list();
          const valid = all.filter((cert) => isCertificateValidNow(cert.validFrom, cert.validTo));

          if (parsed.taskId === "cnj.autenticador" || parsed.taskId === "sso.autenticador") {
            if (valid.length === 0) {
              return withCors(json({ success: false, error: "No valid certificate configured" }));
            }

            const selected = typeof parsed.task?.certificateId === "number"
              ? valid.find((cert) => cert.id === parsed.task.certificateId) ?? valid[0]
              : valid[0];

            return withCors(json({
              success: true,
              tarefaId: parsed.taskId,
              certificado: toPublicCertificate(selected),
            }));
          }

          if (parsed.taskId === "cnj.certchain") {
            if (valid.length === 0) {
              return withCors(json({ success: false, error: "No valid certificate configured" }));
            }
            return withCors(json({
              success: true,
              tarefaId: parsed.taskId,
              cadeia: valid.map(toPublicCertificate),
            }));
          }

          return withCors(json({ success: false, error: `Unsupported taskId: ${parsed.taskId}` }));
        } catch {
          if (req.method !== "POST") {
            return withCors(new Response(FAIL_PNG, { status: 200, headers: { "content-type": "image/png" } }));
          }
          return withCors(json({ success: false, error: "Invalid request" }, 400));
        }
      }

      return withCors(new Response("Not Found", { status: 404 }));
    },
  });

  return { server, store };
}
