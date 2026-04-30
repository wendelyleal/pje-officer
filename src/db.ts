import { Database } from "bun:sqlite";

export type CertificateRecord = {
  id: number;
  name: string;
  pfx: Uint8Array;
  password: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  createdAt: string;
  updatedAt: string;
};

export type NewCertificateInput = {
  name: string;
  pfx: Uint8Array;
  password: string;
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
};

export type UpdateCertificateInput = {
  name?: string;
  pfx?: Uint8Array;
  password?: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
};

const DEFAULT_DB_PATH = `${process.cwd()}/data/pje-officer.sqlite`;

export class CertificateStore {
  readonly db: Database;

  constructor(dbPath = DEFAULT_DB_PATH) {
    this.db = new Database(dbPath, { create: true });
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pfx BLOB NOT NULL,
        password TEXT NOT NULL,
        subject TEXT NOT NULL,
        issuer TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TRIGGER IF NOT EXISTS certificates_updated_at
      AFTER UPDATE ON certificates
      FOR EACH ROW
      BEGIN
        UPDATE certificates SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
      END;
    `);
  }

  list(): CertificateRecord[] {
    const stmt = this.db.query(`
      SELECT id, name, pfx, password, subject, issuer, valid_from, valid_to, created_at, updated_at
      FROM certificates
      ORDER BY id ASC
    `);
    return stmt.all().map(this.toRecord);
  }

  findById(id: number): CertificateRecord | null {
    const stmt = this.db.query(`
      SELECT id, name, pfx, password, subject, issuer, valid_from, valid_to, created_at, updated_at
      FROM certificates
      WHERE id = ?1
    `);
    const row = stmt.get(id);
    return row ? this.toRecord(row) : null;
  }

  create(input: NewCertificateInput): CertificateRecord {
    this.db
      .query(
        `INSERT INTO certificates (name, pfx, password, subject, issuer, valid_from, valid_to)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .run(
        input.name,
        Buffer.from(input.pfx),
        input.password,
        input.subject,
        input.issuer,
        input.validFrom,
        input.validTo,
      );

    const id = Number(this.db.query("SELECT last_insert_rowid() AS id").get()?.id);
    const created = this.findById(id);
    if (!created) {
      throw new Error("Failed to create certificate");
    }
    return created;
  }

  update(id: number, input: UpdateCertificateInput): CertificateRecord | null {
    const current = this.findById(id);
    if (!current) {
      return null;
    }

    this.db
      .query(
        `UPDATE certificates
         SET name = ?1,
             pfx = ?2,
             password = ?3,
             subject = ?4,
             issuer = ?5,
             valid_from = ?6,
             valid_to = ?7
         WHERE id = ?8`
      )
      .run(
        input.name ?? current.name,
        Buffer.from(input.pfx ?? current.pfx),
        input.password ?? current.password,
        input.subject ?? current.subject,
        input.issuer ?? current.issuer,
        input.validFrom ?? current.validFrom,
        input.validTo ?? current.validTo,
        id,
      );

    return this.findById(id);
  }

  remove(id: number): boolean {
    const result = this.db.query("DELETE FROM certificates WHERE id = ?1").run(id);
    return result.changes > 0;
  }

  close() {
    this.db.close();
  }

  private toRecord(row: any): CertificateRecord {
    return {
      id: Number(row.id),
      name: String(row.name),
      pfx: new Uint8Array(row.pfx),
      password: String(row.password),
      subject: String(row.subject),
      issuer: String(row.issuer),
      validFrom: String(row.valid_from),
      validTo: String(row.valid_to),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
