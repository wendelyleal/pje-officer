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
});
