import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { clientFolder } from './client-folder.js';
import type { ClientSummary, ClientInput, SaveResult } from './client.model.js';

interface ClientRow {
  id: string;
  name: string;
  address: string | null;
  code: string | null;
  phone: string | null;
  email: string;
  prefix: string;
  storage_folder: string;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

const COLUMNS =
  'id, name, address, code, phone, email, prefix, storage_folder, created_at, updated_at, disabled_at';

const toSummary = (row: ClientRow): ClientSummary => ({
  id: row.id,
  name: row.name,
  address: row.address,
  code: row.code,
  phone: row.phone,
  email: row.email,
  prefix: row.prefix,
  storageFolder: row.storage_folder,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isActive: row.disabled_at === null,
});

const UNIQUE_INDEXES = {
  clients_code_lower_key: 'code',
  clients_email_lower_key: 'email',
  clients_prefix_lower_key: 'prefix',
} as const;

/** 23505: a unique index refused it. Which field is told by the index name; undefined for any other error. */
function takenField(error: unknown) {
  const { code, constraint } = error as { code?: string; constraint?: string };
  if (code !== '23505') return undefined;
  return UNIQUE_INDEXES[constraint as keyof typeof UNIQUE_INDEXES];
}

@Injectable()
export class ClientsRepository {
  // null while the DATABASE_ENABLED feature flag is off.
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService | null,
  ) {}

  private get pool() {
    if (!this.db) throw new Error('The database feature is not enabled');
    return this.db.pool;
  }

  /** shortcut: no paging, every client at once; add it when the list grows past a few hundred. */
  async list(): Promise<ClientSummary[]> {
    const { rows } = await this.pool.query<ClientRow>(
      `SELECT ${COLUMNS} FROM clients ORDER BY name, id`,
    );
    return rows.map(toSummary);
  }

  async get(id: string): Promise<ClientSummary | null> {
    const { rows } = await this.pool.query<ClientRow>(
      `SELECT ${COLUMNS} FROM clients WHERE id = $1`,
      [id],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  create(input: ClientInput): Promise<SaveResult> {
    // The id and the time are made here because the storage folder is built from them.
    const id = randomUUID();
    const createdAt = new Date();
    return this.save(
      `INSERT INTO clients (id, name, address, code, phone, email, prefix, created_at, storage_folder) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
      [
        id,
        input.name,
        input.address,
        input.code,
        input.phone,
        input.email,
        input.prefix,
        createdAt,
        clientFolder(input.name, createdAt, id),
      ],
    );
  }

  update(id: string, input: ClientInput): Promise<SaveResult> {
    return this.save(
      `UPDATE clients SET name = $2, address = $3, code = $4, phone = $5, email = $6, prefix = $7, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [
        id,
        input.name,
        input.address,
        input.code,
        input.phone,
        input.email,
        input.prefix,
      ],
    );
  }

  /** Disables or enables a client. Null when there is no such client. */
  async setActive(
    id: string,
    isActive: boolean,
  ): Promise<ClientSummary | null> {
    const { rows } = await this.pool.query<ClientRow>(
      `UPDATE clients SET disabled_at = ${isActive ? 'NULL' : 'now()'}, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
      [id],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  private async save(sql: string, params: unknown[]): Promise<SaveResult> {
    try {
      const { rows } = await this.pool.query<ClientRow>(sql, params);
      return rows[0]
        ? { status: 'ok', client: toSummary(rows[0]) }
        : { status: 'not-found' };
    } catch (error) {
      const field = takenField(error);
      if (field) return { status: 'taken', field };
      throw error;
    }
  }
}
