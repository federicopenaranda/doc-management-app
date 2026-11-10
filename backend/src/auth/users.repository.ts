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

/** An archived user, with when it was archived. */
export interface ArchivedUser extends UserSummary {
  archivedAt: Date;
}

export interface NewUser {
  email: string;
  firstName: string;
  lastName: string;
  passwordHash: string;
}

export type EditedUser = Omit<NewUser, 'passwordHash'>;

export type UpdateResult =
  | { status: 'ok'; user: UserSummary }
  | { status: 'not-found' }
  | { status: 'email-taken' };

interface SummaryRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
}

interface ArchivedRow extends SummaryRow {
  archived_at: Date;
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
      `SELECT ${SUMMARY_COLUMNS} FROM users WHERE archived_at IS NULL ORDER BY created_at, id`,
    );
    return rows.map(toSummary);
  }

  /** shortcut: no paging, like list(). */
  async listArchived(): Promise<ArchivedUser[]> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<ArchivedRow>(
      `SELECT ${SUMMARY_COLUMNS}, archived_at FROM users WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id`,
    );
    return rows.map((row) => ({
      ...toSummary(row),
      archivedAt: row.archived_at,
    }));
  }

  /**
   * Brings an archived user back, switched off so nobody regains access by accident. This clears who archived it and
   * when: the record of that is lost until there is an activity log. False when there is no such archived user.
   */
  async restore(id: string): Promise<boolean> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ id: string }>(
      'UPDATE users SET archived_at = NULL, archived_by = NULL, is_active = false WHERE id = $1 AND archived_at IS NOT NULL RETURNING id',
      [id],
    );
    return rows.length > 0;
  }

  /** Replaces the password hash. False when there is no such user or it is archived. */
  async setPasswordHash(id: string, passwordHash: string): Promise<boolean> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ id: string }>(
      'UPDATE users SET password_hash = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      [id, passwordHash],
    );
    return rows.length > 0;
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

  async getSummary(id: string): Promise<UserSummary | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM users WHERE id = $1 AND archived_at IS NULL`,
      [id],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  /** Only the email and the names: the password and the active flag have their own changes. */
  async update(id: string, user: EditedUser): Promise<UpdateResult> {
    if (!this.db) throw new Error('The database feature is not enabled');
    try {
      const { rows } = await this.db.pool.query<SummaryRow>(
        `UPDATE users SET email = $2, first_name = $3, last_name = $4 WHERE id = $1 AND archived_at IS NULL RETURNING ${SUMMARY_COLUMNS}`,
        [id, user.email, user.firstName, user.lastName],
      );
      return rows[0]
        ? { status: 'ok', user: toSummary(rows[0]) }
        : { status: 'not-found' };
    } catch (error) {
      // 23505: the unique index on lower(email) refused it, so another user has that email.
      if ((error as { code?: string }).code === '23505') {
        return { status: 'email-taken' };
      }
      throw error;
    }
  }

  /** Null for a user that does not exist or is archived. */
  async setActive(id: string, isActive: boolean): Promise<UserSummary | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<SummaryRow>(
      `UPDATE users SET is_active = $2 WHERE id = $1 AND archived_at IS NULL RETURNING ${SUMMARY_COLUMNS}`,
      [id, isActive],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  /**
   * Archives a user: it can no longer sign in and leaves the list, but the row, its email and the record of who archived it
   * and when stay. Users are never deleted. False when there is no such user or it was archived already.
   */
  async archive(id: string, archivedBy: string): Promise<boolean> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ id: string }>(
      'UPDATE users SET is_active = false, archived_at = now(), archived_by = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      [id, archivedBy],
    );
    return rows.length > 0;
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
