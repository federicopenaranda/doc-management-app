import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { verifyPassword } from '../auth/password.js';
import type { RefreshTokensRepository } from '../auth/refresh-tokens.repository.js';
import type { UsersRepository } from '../auth/users.repository.js';
import type { UpdateResult, UserSummary } from '../auth/user.model.js';
import { UsersService } from './users.service.js';

const created: UserSummary = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  isActive: true,
  createdAt: new Date('2026-11-09T12:00:00Z'),
  clientId: 'c1',
  roles: ['editor'],
};

function setup(
  result: UserSummary | null = created,
  update: UpdateResult = { status: 'ok', user: created },
  clientIsActive = true,
) {
  const repository = {
    create: vi.fn().mockResolvedValue(result),
    list: vi.fn().mockResolvedValue([created]),
    getSummary: vi.fn().mockResolvedValue(result),
    update: vi.fn().mockResolvedValue(update),
    setActive: vi.fn().mockResolvedValue(result),
    archive: vi.fn().mockResolvedValue(result !== null),
    listArchived: vi.fn().mockResolvedValue([]),
    setPasswordHash: vi.fn().mockResolvedValue(result !== null),
    restore: vi.fn().mockResolvedValue(result !== null),
    listRoles: vi.fn().mockResolvedValue([{ key: 'viewer', name: 'Viewer' }]),
    clientIsActive: vi.fn().mockResolvedValue(clientIsActive),
  };
  const refreshTokens = {
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
  return {
    repository,
    refreshTokens,
    service: new UsersService(
      repository as unknown as UsersRepository,
      refreshTokens as unknown as RefreshTokensRepository,
    ),
  };
}

const input = {
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'García',
  password: 'a long enough password',
  clientId: 'c1',
  roles: ['editor' as const],
};

/** What a 400 about one field carries. */
const fieldError = (field: string) =>
  expect.objectContaining({
    response: {
      errors: [{ field, message: expect.any(String) }],
    },
  });

describe('UsersService.create', () => {
  it('stores a scrypt hash that verifies, never the password, grants the roles on behalf of the actor, and returns the new user', async () => {
    const { service, repository } = setup();

    const user = await service.create('admin-1', input);

    expect(user).toEqual(created);
    const [stored, grantedBy] = repository.create.mock.calls[0] as [
      {
        email: string;
        firstName: string;
        lastName: string;
        passwordHash: string;
        clientId: string | null;
        roles: string[];
      },
      string,
    ];
    expect(stored).toMatchObject({
      email: 'ana@example.com',
      firstName: 'Ana',
      lastName: 'García',
      clientId: 'c1',
      roles: ['editor'],
    });
    expect(grantedBy).toBe('admin-1');
    expect(stored.passwordHash).toMatch(/^scrypt\$/);
    expect(JSON.stringify(stored)).not.toContain(input.password);
    expect(await verifyPassword(input.password, stored.passwordHash)).toBe(
      true,
    );
    expect(Object.keys(stored)).not.toContain('password');
  });

  it('answers 409 when the email already exists', async () => {
    const { service } = setup(null);

    await expect(service.create('admin-1', input)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.create('admin-1', input)).rejects.toThrow(
      'A user with this email already exists',
    );
  });

  it('answers 400 naming clientId when a user without the site_admin role has no client, and stores nothing', async () => {
    const { service, repository } = setup();

    await expect(
      service.create('admin-1', { ...input, clientId: null }),
    ).rejects.toEqual(fieldError('clientId'));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('answers 400 naming clientId when the client is disabled or does not exist', async () => {
    const { service, repository } = setup(created, undefined, false);

    await expect(service.create('admin-1', input)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.create('admin-1', input)).rejects.toEqual(
      fieldError('clientId'),
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('gives a site admin no client, whatever was sent, and checks no client', async () => {
    const { service, repository } = setup();

    await service.create('admin-1', {
      ...input,
      roles: ['site_admin', 'viewer'],
      clientId: 'c1',
    });

    expect(repository.create.mock.calls[0][0]).toMatchObject({
      clientId: null,
      roles: ['site_admin', 'viewer'],
    });
    expect(repository.clientIsActive).not.toHaveBeenCalled();
  });
});

describe('UsersService.list', () => {
  it('returns the users from the repository', async () => {
    const { service } = setup();

    await expect(service.list()).resolves.toEqual([created]);
  });
});

describe('UsersService.listRoles', () => {
  it('returns the roles from the repository', async () => {
    const { service } = setup();

    await expect(service.listRoles()).resolves.toEqual([
      { key: 'viewer', name: 'Viewer' },
    ]);
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
    clientId: 'c1',
    roles: ['editor' as const, 'viewer' as const],
  };

  it('passes the new fields, client and roles to the repository, on behalf of the actor, and returns the user', async () => {
    const { service, repository } = setup();

    await expect(service.update('admin-1', 'u1', edit)).resolves.toEqual(
      created,
    );
    expect(repository.update).toHaveBeenCalledWith('u1', edit, 'admin-1');
  });

  it('answers 404 for a user that does not exist', async () => {
    const { service } = setup(created, { status: 'not-found' });

    await expect(service.update('admin-1', 'nope', edit)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('answers 409 when the email belongs to another user', async () => {
    const { service } = setup(created, { status: 'email-taken' });

    await expect(service.update('admin-1', 'u1', edit)).rejects.toThrow(
      'A user with this email already exists',
    );
    await expect(service.update('admin-1', 'u1', edit)).rejects.toThrow(
      ConflictException,
    );
  });

  it('answers 400 naming clientId for a user without the site_admin role and without an active client', async () => {
    const noClient = setup();
    const disabled = setup(created, undefined, false);

    await expect(
      noClient.service.update('admin-1', 'u1', { ...edit, clientId: null }),
    ).rejects.toEqual(fieldError('clientId'));
    await expect(
      disabled.service.update('admin-1', 'u1', edit),
    ).rejects.toEqual(fieldError('clientId'));
    expect(noClient.repository.update).not.toHaveBeenCalled();
    expect(disabled.repository.update).not.toHaveBeenCalled();
  });

  it('clears the client of a user who becomes a site admin', async () => {
    const { service, repository } = setup();

    await service.update('admin-1', 'u1', {
      ...edit,
      roles: ['site_admin'],
    });

    expect(repository.update).toHaveBeenCalledWith(
      'u1',
      { ...edit, roles: ['site_admin'], clientId: null },
      'admin-1',
    );
  });
});

describe('UsersService.setActive', () => {
  it('turns a user on and returns it, without touching their sessions', async () => {
    const { service, repository, refreshTokens } = setup();

    await expect(service.setActive('admin-1', 'u1', true)).resolves.toEqual(
      created,
    );
    expect(repository.setActive).toHaveBeenCalledWith('u1', true);
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('turns a user off and ends their sessions at once by revoking every refresh token', async () => {
    const { service, repository, refreshTokens } = setup();

    await service.setActive('admin-1', 'u1', false);

    expect(repository.setActive).toHaveBeenCalledWith('u1', false);
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('refuses to disable your own user, and changes nothing', async () => {
    const { service, repository, refreshTokens } = setup();

    await expect(service.setActive('u1', 'u1', false)).rejects.toThrow(
      ConflictException,
    );
    await expect(service.setActive('u1', 'u1', false)).rejects.toThrow(
      'You cannot disable your own user',
    );
    expect(repository.setActive).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('lets you "enable" yourself: it changes nothing', async () => {
    const { service } = setup();

    await expect(service.setActive('u1', 'u1', true)).resolves.toEqual(created);
  });

  it('answers 404 for a user that does not exist or is archived, and revokes nothing', async () => {
    const { service, refreshTokens } = setup(null);

    await expect(service.setActive('admin-1', 'nope', false)).rejects.toThrow(
      NotFoundException,
    );
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});

describe('UsersService.archive', () => {
  it('archives the user on behalf of the admin and ends their sessions', async () => {
    const { service, repository, refreshTokens } = setup();

    await expect(service.archive('admin-1', 'u1')).resolves.toBeUndefined();

    expect(repository.archive).toHaveBeenCalledWith('u1', 'admin-1');
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('refuses to archive your own user, and changes nothing', async () => {
    const { service, repository } = setup();

    await expect(service.archive('u1', 'u1')).rejects.toThrow(
      ConflictException,
    );
    await expect(service.archive('u1', 'u1')).rejects.toThrow(
      'You cannot archive your own user',
    );
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it('answers 404 for a user that does not exist or is archived already', async () => {
    const { service, refreshTokens } = setup(null);

    await expect(service.archive('admin-1', 'nope')).rejects.toThrow(
      NotFoundException,
    );
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});

describe('UsersService.listArchived', () => {
  it('returns what the repository has', async () => {
    const { service, repository } = setup();

    await expect(service.listArchived()).resolves.toEqual([]);
    expect(repository.listArchived).toHaveBeenCalledOnce();
  });
});

describe('UsersService.restore', () => {
  it('restores an archived user', async () => {
    const { service, repository } = setup();

    await expect(service.restore('u1')).resolves.toBeUndefined();

    expect(repository.restore).toHaveBeenCalledWith('u1');
  });

  it('answers 404 for a user that does not exist or is not archived', async () => {
    const { service } = setup(null);

    await expect(service.restore('nope')).rejects.toThrow(NotFoundException);
  });
});

describe('UsersService.setPassword', () => {
  it('stores a scrypt hash that verifies, never the password, and ends the sessions', async () => {
    const { service, repository, refreshTokens } = setup();

    await expect(
      service.setPassword('u1', 'a brand new password'),
    ).resolves.toBeUndefined();

    const [id, hash] = repository.setPasswordHash.mock.calls[0] as [
      string,
      string,
    ];
    expect(id).toBe('u1');
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('a brand new password');
    expect(await verifyPassword('a brand new password', hash)).toBe(true);
    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
  });

  it('answers 404 for a user that does not exist or is archived, and revokes nothing', async () => {
    const { service, refreshTokens } = setup(null);

    await expect(
      service.setPassword('nope', 'a brand new password'),
    ).rejects.toThrow(NotFoundException);
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });
});
