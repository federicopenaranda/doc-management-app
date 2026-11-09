import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

/** What the user screens show: never the password hash. */
export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
}

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}

interface SummaryRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
}

const SUMMARY_COLUMNS =
  'id, email, first_name, last_name, is_active, created_at';

const toSummary = (row: SummaryRow): UserSummary => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  isActive: row.is_active,
  createdAt: row.created_at,
});

@Injectable()
export class UsersRepository {
  // null while the DATABASE_ENABLED feature flag is off.
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService | null,
  ) {}

  /** shortcut: no paging, every user at once; add it when the list grows past a few hundred. */
  async list(): Promise<UserSummary[]> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM users ORDER BY created_at, id`,
    );
    return rows.map(toSummary);
  }

  /** Null when the email is taken (the unique index ignores letter case). */
  async create(user: NewUser): Promise<UserSummary | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<SummaryRow>(
      `INSERT INTO users (email, first_name, last_name, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (lower(email)) DO NOTHING RETURNING ${SUMMARY_COLUMNS}`,
      [user.email, user.firstName, user.lastName, user.passwordHash],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.findOne('lower(email) = lower($1)', email);
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.findOne('id = $1', id);
  }

  private async findOne(
    condition: string,
    value: string,
  ): Promise<UserRecord | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<UserRow>(
      `SELECT id, email, password_hash, is_active FROM users WHERE ${condition}`,
      [value],
    );
    const row = rows[0];
    return row
      ? {
          id: row.id,
          email: row.email,
          passwordHash: row.password_hash,
          isActive: row.is_active,
        }
      : null;
  }
}
