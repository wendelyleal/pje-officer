import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type CertificateMetadata = {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
};

export async function readPfxFile(filePath: string): Promise<Uint8Array> {
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new Error(`Certificate file not found: ${filePath}`);
  }
  return new Uint8Array(await file.arrayBuffer());
}

export async function extractCertificateMetadata(pfxContent: Uint8Array, password: string): Promise<CertificateMetadata> {
  const tmpBase = join(tmpdir(), `pje-officer-${randomUUID()}`);
  const pfxPath = `${tmpBase}.pfx`;
  const crtPath = `${tmpBase}.crt`;

  await Bun.write(pfxPath, pfxContent);

  try {
    const exportCrt = Bun.spawnSync({
      cmd: ["openssl", "pkcs12", "-in", pfxPath, "-clcerts", "-nokeys", "-out", crtPath, "-passin", `pass:${password}`],
      stdout: "pipe",
      stderr: "pipe",
    });

    if (exportCrt.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(exportCrt.stderr).trim() || "Failed to read PKCS#12 certificate");
    }

    const readInfo = Bun.spawnSync({
      cmd: ["openssl", "x509", "-in", crtPath, "-noout", "-subject", "-issuer", "-dates"],
      stdout: "pipe",
      stderr: "pipe",
    });

    if (readInfo.exitCode !== 0) {
      throw new Error(new TextDecoder().decode(readInfo.stderr).trim() || "Failed to extract certificate metadata");
    }

    const output = new TextDecoder().decode(readInfo.stdout);
    const lines = output.split(/\r?\n/).filter(Boolean);

    const subject = lines.find((line) => line.startsWith("subject="))?.slice("subject=".length).trim();
    const issuer = lines.find((line) => line.startsWith("issuer="))?.slice("issuer=".length).trim();
    const notBefore = lines.find((line) => line.startsWith("notBefore="))?.slice("notBefore=".length).trim();
    const notAfter = lines.find((line) => line.startsWith("notAfter="))?.slice("notAfter=".length).trim();

    if (!subject || !issuer || !notBefore || !notAfter) {
      throw new Error("Could not parse certificate metadata");
    }

    return {
      subject,
      issuer,
      validFrom: new Date(notBefore).toISOString(),
      validTo: new Date(notAfter).toISOString(),
    };
  } finally {
    await Bun.file(pfxPath).delete().catch(() => undefined);
    await Bun.file(crtPath).delete().catch(() => undefined);
  }
}

export function isCertificateValidNow(validFromIso: string, validToIso: string) {
  const now = Date.now();
  return now >= new Date(validFromIso).getTime() && now <= new Date(validToIso).getTime();
}
