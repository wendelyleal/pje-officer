import { afterEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { CertificateStore } from "../src/db.ts";

const stores: CertificateStore[] = [];

afterEach(() => {
  while (stores.length > 0) {
    const store = stores.pop();
    store?.close();
  }
});

describe("CertificateStore", () => {
  it("creates, updates and removes certificates", () => {
    const dbPath = `/tmp/pje-officer-${randomUUID()}.sqlite`;
    const store = new CertificateStore(dbPath);
    stores.push(store);

    const created = store.create({
      name: "Test",
      pfx: new Uint8Array([1, 2, 3]),
      password: "123",
      subject: "CN=Test",
      issuer: "CN=Issuer",
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2030-01-01T00:00:00.000Z",
    });

    expect(created.id).toBe(1);
    expect(store.list()).toHaveLength(1);

    const updated = store.update(created.id, { name: "Test 2", password: "456" });
    expect(updated?.name).toBe("Test 2");
    expect(updated?.password).toBe("456");

    const removed = store.remove(created.id);
    expect(removed).toBe(true);
    expect(store.list()).toHaveLength(0);
  });
});
