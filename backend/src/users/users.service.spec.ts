import { ConflictException } from '@nestjs/common';
import { verifyPassword } from '../auth/password.js';
import type { UserSummary, UsersRepository } from '../auth/users.repository.js';
import { UsersService } from './users.service.js';

const created: UserSummary = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: new Date('2026-11-09T12:00:00Z'),
};

function setup(result: UserSummary | null = created) {
  const repository = {
    create: vi.fn().mockResolvedValue(result),
    list: vi.fn().mockResolvedValue([created]),
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
