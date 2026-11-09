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

@Injectable()
export class UsersRepository {
  // null while the DATABASE_ENABLED feature flag is off.
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService | null,
  ) {}

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
