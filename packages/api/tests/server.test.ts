import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { startServer } from "../src/server.ts";

const running: Array<ReturnType<typeof startServer>> = [];

afterEach(() => {
  while (running.length > 0) {
    const item = running.pop();
    item?.server.stop(true);
    item?.store.close();
  }
});

describe("pjeoffice compatibility endpoints", () => {
  function addValidCertificate(ctx: ReturnType<typeof startServer>) {
    return ctx.store.create({
      name: "Test A1",
      pfx: new Uint8Array([1, 2, 3]),
      password: "123",
      subject: "CN=Test A1",
      issuer: "CN=Test Issuer",
      validFrom: "2024-01-01T00:00:00.000Z",
      validTo: "2035-01-01T00:00:00.000Z",
    });
  }

  it("responds to ping and version", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);

    const base = `http://${ctx.server.hostname}:${ctx.server.port}`;

    const ping = await fetch(`${base}/pjeOffice/`, { method: "POST" }).then((res) => res.json());
    expect(ping.success).toBe(true);

    const version = await fetch(`${base}/pjeOffice/versao/`).then((res) => res.json());
    expect(version).toHaveProperty("versao");
  });

  it("fails authenticator task when no certificate exists", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);

    const payload = encodeURIComponent(JSON.stringify({
      sessao: "s",
      aplicacao: "Pje",
      servidor: "http://localhost",
      codigoSeguranca: "bypass",
      tarefaId: "cnj.autenticador",
      tarefa: JSON.stringify({ enviarPara: "/" }),
    }));

    const result = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/pjeOffice/requisicao/?r=${payload}`, {
      method: "POST",
    }).then((res) => res.json());

    expect(result.success).toBe(false);
    expect(result.error).toContain("No valid certificate");
  });

  it("returns selected certificate for cnj.autenticador", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);
    const created = addValidCertificate(ctx);

    const payload = encodeURIComponent(JSON.stringify({
      sessao: "s",
      aplicacao: "Pje",
      servidor: "http://localhost",
      codigoSeguranca: "bypass",
      tarefaId: "cnj.autenticador",
      tarefa: JSON.stringify({ certificateId: created.id }),
    }));

    const result = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/pjeOffice/requisicao/?r=${payload}`, {
      method: "POST",
    }).then((res) => res.json());

    expect(result.success).toBe(true);
    expect(result.tarefaId).toBe("cnj.autenticador");
    expect(result.certificado.id).toBe(created.id);
    expect(result.certificado.subject).toContain("CN=Test A1");
  });

  it("returns certificate chain for cnj.certchain", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);
    addValidCertificate(ctx);

    const payload = encodeURIComponent(JSON.stringify({
      sessao: "s",
      aplicacao: "Pje",
      servidor: "http://localhost",
      codigoSeguranca: "bypass",
      tarefaId: "cnj.certchain",
      tarefa: JSON.stringify({ uploadUrl: "/callback" }),
    }));

    const result = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/pjeOffice/requisicao/?r=${payload}`, {
      method: "POST",
    }).then((res) => res.json());

    expect(result.success).toBe(true);
    expect(result.tarefaId).toBe("cnj.certchain");
    expect(Array.isArray(result.cadeia)).toBe(true);
    expect(result.cadeia).toHaveLength(1);
  });
});

describe("certificate api endpoints", () => {
  function addValidCertificate(ctx: ReturnType<typeof startServer>) {
    return ctx.store.create({
      name: "Test A1",
      pfx: new Uint8Array([1, 2, 3]),
      password: "123",
      subject: "CN=Test A1",
      issuer: "CN=Test Issuer",
      validFrom: "2024-01-01T00:00:00.000Z",
      validTo: "2035-01-01T00:00:00.000Z",
    });
  }

  it("updates name without clearing existing password when password is blank", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);
    const created = addValidCertificate(ctx);

    const response = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/api/certificates/${created.id}/`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Renamed", password: "   ", pfxBase64: "" }),
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.name).toBe("Renamed");
    expect(ctx.store.findById(created.id)?.password).toBe("123");
  });

  it("returns 400 when update request has no effective fields", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);
    const created = addValidCertificate(ctx);

    const response = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/api/certificates/${created.id}/`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: " ", password: "   ", pfxBase64: "" }),
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error).toContain("No fields to update");
  });

  it("returns 404 for missing certificate before parsing pfx payload", async () => {
    const ctx = startServer({ port: 0, dbPath: `/tmp/pje-officer-${randomUUID()}.sqlite` });
    running.push(ctx);

    const response = await fetch(`http://${ctx.server.hostname}:${ctx.server.port}/api/certificates/999/`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pfxBase64: "AQID", password: "123" }),
    });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.error).toContain("Certificate not found");
  });
});
