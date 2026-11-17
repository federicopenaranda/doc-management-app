import type { DatabaseService } from '../database/database.service.js';
import { RefreshTokensRepository } from './refresh-tokens.repository.js';

function setup(...answers: { rows: unknown[] }[]) {
  const query = vi.fn();
  for (const answer of answers) query.mockResolvedValueOnce(answer);
  query.mockResolvedValue({ rows: [] });
  const repository = new RefreshTokensRepository({
    pool: { query },
  } as unknown as DatabaseService);
  return { repository, query };
}

describe('RefreshTokensRepository.insert', () => {
  it('stores the hash with bound parameters', async () => {
    const { repository, query } = setup();
    const expiresAt = new Date('2026-11-16T00:00:00Z');

    await repository.insert('u1', 'hash-1', expiresAt);

    expect(query).toHaveBeenCalledWith(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      ['u1', 'hash-1', expiresAt],
    );
  });
});

describe('RefreshTokensRepository.consume', () => {
  it('marks an unused, unexpired token as used in one statement and returns its owner', async () => {
    const { repository, query } = setup({ rows: [{ user_id: 'u1' }] });

    const result = await repository.consume('hash-1');

    expect(result).toEqual({ status: 'ok', userId: 'u1' });
    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/^UPDATE refresh_tokens SET used_at = now\(\)/);
    expect(sql).toMatch(
      /WHERE token_hash = \$1 AND used_at IS NULL AND expires_at > now\(\)/,
    );
    expect(sql).toMatch(/RETURNING user_id$/);
    expect(params).toEqual(['hash-1']);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('reports a token that was already used as reused, with its owner', async () => {
    const { repository } = setup(
      { rows: [] },
      { rows: [{ user_id: 'u1', used_at: new Date() }] },
    );

    expect(await repository.consume('hash-1')).toEqual({
      status: 'reused',
      userId: 'u1',
    });
  });

  it('reports an unknown token as invalid', async () => {
    const { repository } = setup({ rows: [] }, { rows: [] });

    expect(await repository.consume('nope')).toEqual({ status: 'invalid' });
  });

  it('reports an expired token that was never used as invalid, not reused', async () => {
    const { repository } = setup(
      { rows: [] },
      { rows: [{ user_id: 'u1', used_at: null }] },
    );

    expect(await repository.consume('hash-1')).toEqual({ status: 'invalid' });
  });
});

describe('RefreshTokensRepository.revoke and revokeAllForUser', () => {
  it('revokes one token without touching the time of one that was already used', async () => {
    const { repository, query } = setup();

    await repository.revoke('hash-1');

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toBe(
      'UPDATE refresh_tokens SET used_at = coalesce(used_at, now()) WHERE token_hash = $1',
    );
    expect(params).toEqual(['hash-1']);
  });

  it('revokes every token of a user that is still usable', async () => {
    const { repository, query } = setup();

    await repository.revokeAllForUser('u1');

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toBe(
      'UPDATE refresh_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL',
    );
    expect(params).toEqual(['u1']);
  });
});

describe('RefreshTokensRepository without a database', () => {
  it('fails clearly when the database feature is off', async () => {
    const repository = new RefreshTokensRepository(null);

    await expect(repository.consume('x')).rejects.toThrow('database');
  });
});
