import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type {
  UserRecord,
  UserSummary,
  ArchivedUser,
  Language,
  NewUser,
  EditedUser,
  UpdateResult,
  Role,
  RoleKey,
} from './user.model.js';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_active: boolean;
}

interface SummaryRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  created_at: Date;
  client_id: string | null;
  roles: RoleKey[];
}

interface ArchivedRow extends SummaryRow {
  archived_at: Date;
}

// The active roles are read in the same statement, so a user is never returned without them.
const SUMMARY_COLUMNS =
  "id, email, first_name, last_name, is_active, created_at, client_id, COALESCE((SELECT array_agg(role_key ORDER BY role_key) FROM user_roles WHERE user_roles.user_id = users.id AND user_roles.revoked_at IS NULL), '{}') AS roles";

const toSummary = (row: SummaryRow): UserSummary => ({
  id: row.id,
  email: row.email,
  firstName: row.first_name,
  lastName: row.last_name,
  isActive: row.is_active,
  createdAt: row.created_at,
  clientId: row.client_id,
  roles: row.roles,
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

  /** Null for a user that does not exist or is archived. */
  async getLanguage(id: string): Promise<Language | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ language: Language }>(
      'SELECT language FROM users WHERE id = $1 AND archived_at IS NULL',
      [id],
    );
    return rows[0]?.language ?? null;
  }

  /** False when there is no such user or it is archived. */
  async setLanguage(id: string, language: Language): Promise<boolean> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ id: string }>(
      'UPDATE users SET language = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      [id, language],
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
  async create(user: NewUser, grantedBy: string): Promise<UserSummary | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    // One statement, so a user never exists without their roles.
    const { rows } = await this.db.pool.query<{ id: string }>(
      'WITH u AS (INSERT INTO users (email, first_name, last_name, password_hash, client_id) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (lower(email)) DO NOTHING RETURNING id), r AS (INSERT INTO user_roles (user_id, role_key, granted_by) SELECT u.id, k, $7 FROM u, unnest($6::text[]) AS k) SELECT id FROM u',
      [
        user.email,
        user.firstName,
        user.lastName,
        user.passwordHash,
        user.clientId,
        user.roles,
        grantedBy,
      ],
    );
    return rows[0] ? this.getSummary(rows[0].id) : null;
  }

  /** The roles of the screens' role pickers, in their usual order. */
  async listRoles(): Promise<Role[]> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<Role>(
      "SELECT key, name FROM roles ORDER BY array_position(ARRAY['viewer', 'editor', 'admin', 'site_admin'], key)",
    );
    return rows;
  }

  /** True for a client that exists and is not disabled. */
  async clientIsActive(id: string): Promise<boolean> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<{ id: string }>(
      'SELECT id FROM clients WHERE id = $1 AND disabled_at IS NULL',
      [id],
    );
    return rows.length > 0;
  }

  async getSummary(id: string): Promise<UserSummary | null> {
    if (!this.db) throw new Error('The database feature is not enabled');
    const { rows } = await this.db.pool.query<SummaryRow>(
      `SELECT ${SUMMARY_COLUMNS} FROM users WHERE id = $1 AND archived_at IS NULL`,
      [id],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  /**
   * The email, the names, the client and the roles: the password and the active flag have their own changes. Roles that
   * are no longer wanted are revoked (never deleted, so the history stays) and new ones granted, all in one statement.
   */
  async update(
    id: string,
    user: EditedUser,
    actorId: string,
  ): Promise<UpdateResult> {
    if (!this.db) throw new Error('The database feature is not enabled');
    try {
      const { rows } = await this.db.pool.query<{ id: string }>(
        'WITH u AS (UPDATE users SET email = $2, first_name = $3, last_name = $4, client_id = $5 WHERE id = $1 AND archived_at IS NULL RETURNING id), revoked AS (UPDATE user_roles SET revoked_at = now(), revoked_by = $7 WHERE user_id IN (SELECT id FROM u) AND revoked_at IS NULL AND role_key <> ALL($6::text[])), added AS (INSERT INTO user_roles (user_id, role_key, granted_by) SELECT u.id, k, $7 FROM u, unnest($6::text[]) AS k WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role_key = k AND r.revoked_at IS NULL)) SELECT id FROM u',
        [
          id,
          user.email,
          user.firstName,
          user.lastName,
          user.clientId,
          user.roles,
          actorId,
        ],
      );
      const saved = rows[0] ? await this.getSummary(rows[0].id) : null;
      return saved ? { status: 'ok', user: saved } : { status: 'not-found' };
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
