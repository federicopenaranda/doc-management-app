import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export type ConsumeResult =
  | { status: 'ok'; userId: string }
  // The token was already used or revoked: someone is replaying it.
  | { status: 'reused'; userId: string }
  | { status: 'invalid' };

/** Only the hash of a refresh token is ever stored or looked up. */
@Injectable()
export class RefreshTokensRepository {
  // null while the DATABASE_ENABLED feature flag is off.
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService | null,
  ) {}

  private get pool() {
    if (!this.db) throw new Error('The database feature is not enabled');
    return this.db.pool;
  }

  async insert(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt],
    );
  }

  /** One statement, so two requests with the same token cannot both succeed. */
  async consume(tokenHash: string): Promise<ConsumeResult> {
    const used = await this.pool.query<{ user_id: string }>(
      'UPDATE refresh_tokens SET used_at = now() WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id',
      [tokenHash],
    );
    if (used.rows[0]) return { status: 'ok', userId: used.rows[0].user_id };

    const known = await this.pool.query<{
      user_id: string;
      used_at: Date | null;
    }>('SELECT user_id, used_at FROM refresh_tokens WHERE token_hash = $1', [
      tokenHash,
    ]);
    const row = known.rows[0];
    return row?.used_at
      ? { status: 'reused', userId: row.user_id }
      : { status: 'invalid' };
  }

  async revoke(tokenHash: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET used_at = coalesce(used_at, now()) WHERE token_hash = $1',
      [tokenHash],
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
      [userId],
    );
  }
}
