import { UsersRepository } from './users.repository.js';
import type { DatabaseService } from '../database/database.service.js';

function setup(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  const repository = new UsersRepository({
    pool: { query },
  } as unknown as DatabaseService);
  return { repository, query };
}

describe('UsersRepository.findByEmail', () => {
  it('looks the email up case-insensitively with a bound parameter, never by string building', async () => {
    const { repository, query } = setup([]);

    await repository.findByEmail("Ana@Example.com' OR 1=1 --");

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/FROM users WHERE lower\(email\) = lower\(\$1\)/);
    expect(sql).not.toContain('OR 1=1');
    expect(params).toEqual(["Ana@Example.com' OR 1=1 --"]);
  });

  it('maps the row to a user record', async () => {
    const { repository } = setup([
      {
        id: 'u1',
        email: 'ana@example.com',
        password_hash: 'scrypt$x',
        is_active: true,
      },
    ]);

    expect(await repository.findByEmail('ana@example.com')).toEqual({
      id: 'u1',
      email: 'ana@example.com',
      passwordHash: 'scrypt$x',
      isActive: true,
    });
  });

  it('returns null when there is no such user', async () => {
    const { repository } = setup([]);

    expect(await repository.findByEmail('nobody@example.com')).toBeNull();
  });

  it('fails clearly when the database feature is off', async () => {
    const repository = new UsersRepository(null);

    await expect(repository.findByEmail('a@b.co')).rejects.toThrow('database');
  });
});
