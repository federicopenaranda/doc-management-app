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

describe('UsersRepository.findById', () => {
  it('looks the user up by id with a bound parameter and maps the row', async () => {
    const { repository, query } = setup([
      {
        id: 'u1',
        email: 'ana@example.com',
        password_hash: 'scrypt$x',
        is_active: false,
      },
    ]);

    const user = await repository.findById('u1');

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toMatch(/FROM users WHERE id = \$1/);
    expect(params).toEqual(['u1']);
    expect(user).toEqual({
      id: 'u1',
      email: 'ana@example.com',
      passwordHash: 'scrypt$x',
      isActive: false,
    });
  });

  it('returns null when there is no such user', async () => {
    const { repository } = setup([]);

    expect(await repository.findById('missing')).toBeNull();
  });
});

const summaryRow = {
  id: 'u1',
  email: 'ana@example.com',
  first_name: 'Ana',
  last_name: 'García',
  is_active: true,
  created_at: new Date('2026-11-09T12:00:00Z'),
};
const summary = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: new Date('2026-11-09T12:00:00Z'),
};

describe('UsersRepository.list', () => {
  it('lists every user oldest first, without the password hash', async () => {
    const { repository, query } = setup([summaryRow]);

    const users = await repository.list();

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toBe(
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users ORDER BY created_at, id',
    );
    expect(sql).not.toContain('password_hash');
    expect(users).toEqual([summary]);
    expect(Object.keys(users[0])).not.toContain('passwordHash');
  });
});

describe('UsersRepository.create', () => {
  const input = {
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
    passwordHash: 'scrypt$x',
  };

  it('inserts with bound parameters and returns the new user without the hash', async () => {
    const { repository, query } = setup([summaryRow]);

    const created = await repository.create(input);

    const [sql, params] = query.mock.calls[0] as [string, string[]];
    expect(sql).toBe(
      'INSERT INTO users (email, first_name, last_name, password_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (lower(email)) DO NOTHING RETURNING id, email, first_name, last_name, is_active, created_at',
    );
    expect(params).toEqual(['ana@example.com', 'Ana', 'García', 'scrypt$x']);
    expect(created).toEqual(summary);
  });

  it('returns null when the email already exists, whatever its letter case', async () => {
    const { repository } = setup([]);

    expect(await repository.create(input)).toBeNull();
  });

  it('never builds the statement from the input', async () => {
    const { repository, query } = setup([summaryRow]);

    await repository.create({
      ...input,
      firstName: "x'); DROP TABLE users;--",
    });

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toContain('DROP TABLE');
  });
});
