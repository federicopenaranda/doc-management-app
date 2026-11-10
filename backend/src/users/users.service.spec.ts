import { ConflictException, NotFoundException } from '@nestjs/common';
import { verifyPassword } from '../auth/password.js';
import type {
  UpdateResult,
  UserSummary,
  UsersRepository,
} from '../auth/users.repository.js';
import { UsersService } from './users.service.js';

const created: UserSummary = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: new Date('2026-11-09T12:00:00Z'),
};

function setup(
  result: UserSummary | null = created,
  update: UpdateResult = { status: 'ok', user: created },
) {
  const repository = {
    create: vi.fn().mockResolvedValue(result),
    list: vi.fn().mockResolvedValue([created]),
    getSummary: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockResolvedValue(update),
  };
  return {
    repository,
    service: new UsersService(repository as unknown as UsersRepository),
  };
}

const input = {
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  password: 'a long enough password',
};

describe('UsersService.create', () => {
  it('stores a scrypt hash that verifies, never the password, and returns the new user', async () => {
    const { service, repository } = setup();

    const user = await service.create(input);

    expect(user).toEqual(created);
    const stored = repository.create.mock.calls[0][0] as {
      email: string;
      firstName: string;
      lastName: string;
      passwordHash: string;
    };
    expect(stored).toMatchObject({
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'García',
    });
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(stored)).not.toContain(input.password);
    expect(await verifyPassword(input.password, stored.passwordHash)).toBe(
      true,
    );
    expect(Object.keys(stored)).not.toContain('password');
  });

  it('answers 409 when the email already exists', async () => {
    const { service } = setup(null);

    await expect(service.create(input)).rejects.toThrow(ConflictException);
    await expect(service.create(input)).rejects.toThrow(
      'A user with this email already exists',
    );
  });
});

describe('UsersService.list', () => {
  it('returns the users from the repository', async () => {
    const { service } = setup();

    await expect(service.list()).resolves.toEqual([created]);
  });
});

describe('UsersService.get', () => {
  it('returns one user', async () => {
    const { service, repository } = setup();

    await expect(service.get('u1')).resolves.toEqual(created);
    expect(repository.getSummary).toHaveBeenCalledWith('u1');
  });

  it('answers 404 for a user that does not exist', async () => {
    const { service } = setup(null);

    await expect(service.get('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.update', () => {
  const edit = {
    email: 'ana.garcia@example.com',
    firstName: 'Ana',
    lastName: 'García',
  };

  it('passes the new email and names to the repository and returns the user', async () => {
    const { service, repository } = setup();

    await expect(service.update('u1', edit)).resolves.toEqual(created);
    expect(repository.update).toHaveBeenCalledWith('u1', edit);
  });

  it('answers 404 for a user that does not exist', async () => {
    const { service } = setup(created, { status: 'not-found' });

    await expect(service.update('nope', edit)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers 409 when the email belongs to another user', async () => {
    const { service } = setup(created, { status: 'email-taken' });

    await expect(service.update('u1', edit)).rejects.toThrow(
      'A user with this email already exists',
    );
    await expect(service.update('u1', edit)).rejects.toThrow(ConflictException);
  });
});
