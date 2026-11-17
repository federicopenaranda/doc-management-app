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
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE archived_at IS NULL ORDER BY created_at, id',
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

describe('UsersRepository.getSummary', () => {
  it('looks one user up by id with a bound parameter and returns it without the hash', async () => {
    const { repository, query } = setup([summaryRow]);

    const user = await repository.getSummary('u1');

    expect(query).toHaveBeenCalledWith(
      'SELECT id, email, first_name, last_name, is_active, created_at FROM users WHERE id = $1 AND archived_at IS NULL',
      ['u1'],
    );
    expect(user).toEqual(summary);
  });

  it('returns null when there is no such user', async () => {
    const { repository } = setup([]);

    expect(await repository.getSummary('missing')).toBeNull();
  });
});

describe('UsersRepository.update', () => {
  const input = {
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'García',
  };

  it('changes the email and the names of one user with bound parameters and returns it', async () => {
    const { repository, query } = setup([summaryRow]);

    const result = await repository.update('u1', input);

    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET email = $2, first_name = $3, last_name = $4 WHERE id = $1 AND archived_at IS NULL RETURNING id, email, first_name, last_name, is_active, created_at',
      ['u1', 'ana@example.com', 'Ana', 'García'],
    );
    expect(result).toEqual({ status: 'ok', user: summary });
  });

  it('never touches the password hash or the active flag', async () => {
    const { repository, query } = setup([summaryRow]);

    await repository.update('u1', input);

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toMatch(/password_hash|is_active =/);
  });

  it('reports a user that does not exist', async () => {
    const { repository } = setup([]);

    expect(await repository.update('missing', input)).toEqual({
      status: 'not-found',
    });
  });

  it('reports an email that belongs to another user (unique violation)', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );
    const repository = new UsersRepository({
      pool: { query },
    } as unknown as DatabaseService);

    expect(await repository.update('u1', input)).toEqual({
      status: 'email-taken',
    });
  });

  it('lets any other database error through', async () => {
    const query = vi.fn().mockRejectedValue(new Error('connection lost'));
    const repository = new UsersRepository({
      pool: { query },
    } as unknown as DatabaseService);

    await expect(repository.update('u1', input)).rejects.toThrow(
      'connection lost',
    );
  });
});

describe('UsersRepository.setActive', () => {
  it('turns one user on or off with bound parameters and returns it', async () => {
    const { repository, query } = setup([{ ...summaryRow, is_active: false }]);

    const user = await repository.setActive('u1', false);

    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET is_active = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id, email, first_name, last_name, is_active, created_at',
      ['u1', false],
    );
    expect(user).toEqual({ ...summary, isActive: false });
  });

  it('returns null for a user that does not exist or is archived', async () => {
    const { repository } = setup([]);

    expect(await repository.setActive('missing', true)).toBeNull();
  });
});

describe('UsersRepository.archive', () => {
  it('marks the user archived (when and by whom), switches it off, and keeps the row', async () => {
    const { repository, query } = setup([{ id: 'u1' }]);

    const archived = await repository.archive('u1', 'admin-1');

    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET is_active = false, archived_at = now(), archived_by = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      ['u1', 'admin-1'],
    );
    expect(archived).toBe(true);
    const [sql] = query.mock.calls[0] as [string];
    expect(sql).not.toMatch(/DELETE/i);
  });

  it('says false for a user that does not exist or was archived already', async () => {
    const { repository } = setup([]);

    expect(await repository.archive('missing', 'admin-1')).toBe(false);
  });
});

describe('UsersRepository.listArchived', () => {
  it('lists only archived users, newest first, with when they were archived and no password hash', async () => {
    const archivedAt = new Date('2026-11-10T09:00:00Z');
    const { repository, query } = setup([
      { ...summaryRow, archived_at: archivedAt },
    ]);

    const users = await repository.listArchived();

    const [sql] = query.mock.calls[0] as [string];
    expect(sql).toBe(
      'SELECT id, email, first_name, last_name, is_active, created_at, archived_at FROM users WHERE archived_at IS NOT NULL ORDER BY archived_at DESC, id',
    );
    expect(sql).not.toContain('password_hash');
    expect(users).toEqual([{ ...summary, archivedAt }]);
  });
});

describe('UsersRepository.restore', () => {
  it('clears the archive marks and leaves the user disabled', async () => {
    const { repository, query } = setup([{ id: 'u1' }]);

    const restored = await repository.restore('u1');

    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET archived_at = NULL, archived_by = NULL, is_active = false WHERE id = $1 AND archived_at IS NOT NULL RETURNING id',
      ['u1'],
    );
    expect(restored).toBe(true);
  });

  it('says false for a user that does not exist or is not archived', async () => {
    const { repository } = setup([]);

    expect(await repository.restore('missing')).toBe(false);
  });
});

describe('UsersRepository.setPasswordHash', () => {
  it('replaces only the hash of one user, with bound parameters', async () => {
    const { repository, query } = setup([{ id: 'u1' }]);

    const changed = await repository.setPasswordHash('u1', 'scrypt$new');

    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET password_hash = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      ['u1', 'scrypt$new'],
    );
    expect(changed).toBe(true);
  });

  it('says false for a user that does not exist or is archived', async () => {
    const { repository } = setup([]);

    expect(await repository.setPasswordHash('missing', 'scrypt$x')).toBe(false);
  });
});

describe('UsersRepository.getLanguage', () => {
  it('reads the language of one user with a bound parameter', async () => {
    const { repository, query } = setup([{ language: 'es' }]);

    expect(await repository.getLanguage('u1')).toBe('es');
    expect(query).toHaveBeenCalledWith(
      'SELECT language FROM users WHERE id = $1 AND archived_at IS NULL',
      ['u1'],
    );
  });

  it('returns null when there is no such user', async () => {
    const { repository } = setup([]);

    expect(await repository.getLanguage('missing')).toBeNull();
  });
});

describe('UsersRepository.setLanguage', () => {
  it('changes only the language of one user, with bound parameters', async () => {
    const { repository, query } = setup([{ id: 'u1' }]);

    expect(await repository.setLanguage('u1', 'es')).toBe(true);
    expect(query).toHaveBeenCalledWith(
      'UPDATE users SET language = $2 WHERE id = $1 AND archived_at IS NULL RETURNING id',
      ['u1', 'es'],
    );
  });

  it('says false for a user that does not exist or is archived', async () => {
    const { repository } = setup([]);

    expect(await repository.setLanguage('missing', 'en')).toBe(false);
  });
});
