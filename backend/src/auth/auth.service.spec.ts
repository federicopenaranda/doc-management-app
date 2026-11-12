import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { hashPassword, verifyPassword } from './password.js';
import type {
  ConsumeResult,
  RefreshTokensRepository,
} from './refresh-tokens.repository.js';
import type { UserRecord, UsersRepository } from './users.repository.js';

vi.mock('./password.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./password.js')>();
  return {
    ...original,
    verifyPassword: vi.fn((password: string, stored: string) =>
      original.verifyPassword(password, stored),
    ),
  };
});

const SECRET = 'test-secret-test-secret-test-secret-1234';
const FAST = { N: 1024, r: 8, p: 1 };

const USER_ID = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function setup(
  overrides: Partial<UserRecord> = {},
  { consume = { status: 'invalid' } as ConsumeResult } = {},
) {
  const user: UserRecord = {
    id: '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11',
    email: 'ana@example.com',
    passwordHash: await hashPassword('correct horse battery', FAST),
    isActive: true,
    ...overrides,
  };
  const findByEmail = vi.fn((email: string) =>
    Promise.resolve(email === user.email ? user : null),
  );
  const findById = vi.fn((id: string) =>
    Promise.resolve(id === user.id ? user : null),
  );
  const getSummary = vi.fn((id: string) =>
    Promise.resolve(
      id === user.id
        ? {
            id: user.id,
            email: user.email,
            firstName: 'Ana',
            lastName: 'García',
            isActive: user.isActive,
            createdAt: new Date('2026-11-09T12:00:00Z'),
          }
        : null,
    ),
  );
  const getLanguage = vi.fn(() => Promise.resolve('es'));
  const setLanguage = vi.fn(() => Promise.resolve(true));
  const jwt = new JwtService({ secret: SECRET });
  const refreshTokens = {
    insert: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn().mockResolvedValue(consume),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(undefined),
  };
  const users = {
    findByEmail,
    findById,
    getSummary,
    getLanguage,
    setLanguage,
  };
  const service = new AuthService(
    users as unknown as UsersRepository,
    jwt,
    refreshTokens as unknown as RefreshTokensRepository,
  );
  return {
    service,
    jwt,
    findByEmail,
    findById,
    getSummary,
    refreshTokens,
    users,
    user,
  };
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return (error as UnauthorizedException).message;
  }
  throw new Error('expected the login to fail');
}

describe('AuthService.login', () => {
  beforeEach(() => {
    vi.mocked(verifyPassword).mockClear();
  });

  it('returns a one-hour access token for the right email and password', async () => {
    const { service, jwt, user } = await setup();

    const result = await service.login(user.email, 'correct horse battery');

    expect(result.expiresIn).toBe(3600);
    const payload = await jwt.verifyAsync<{
      sub: string;
      email: string;
      exp: number;
      iat: number;
    }>(result.accessToken);
    expect(payload.sub).toBe(user.id);
    expect(payload.email).toBe(user.email);
    expect(payload.exp - payload.iat).toBe(3600);
  });

  it('trims the email before looking it up', async () => {
    const { service, findByEmail, user } = await setup();

    await service.login(`  ${user.email}  `, 'correct horse battery');

    expect(findByEmail).toHaveBeenCalledWith(user.email);
  });

  it('never puts the password or its hash in the token', async () => {
    const { service, user } = await setup();

    const { accessToken } = await service.login(
      user.email,
      'correct horse battery',
    );

    const payload = Buffer.from(
      accessToken.split('.')[1],
      'base64url',
    ).toString();
    expect(payload).not.toContain('correct horse battery');
    expect(payload).not.toContain('scrypt');
  });

  it('gives the same error for a wrong password, an unknown email and an inactive user', async () => {
    const { service, user } = await setup();
    const inactive = await setup({ isActive: false });

    const messages = await Promise.all([
      messageOf(service.login(user.email, 'wrong password!!')),
      messageOf(service.login('nobody@example.com', 'correct horse battery')),
      messageOf(inactive.service.login(user.email, 'correct horse battery')),
    ]);

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).not.toMatch(/ana@example\.com|nobody|inactive|wrong/i);
  });

  it('still checks a password for an unknown email, so timing does not reveal who exists', async () => {
    const { service } = await setup();

    await messageOf(service.login('nobody@example.com', 'whatever password'));

    expect(verifyPassword).toHaveBeenCalledTimes(1);
  });

  it('rejects an inactive user even with the right password', async () => {
    const { service, user } = await setup({ isActive: false });

    await messageOf(service.login(user.email, 'correct horse battery'));
  });
});

describe('AuthService.login with refresh tokens', () => {
  it('returns a refresh token and stores only its hash, valid for 7 days', async () => {
    const { service, refreshTokens, user } = await setup({}, {});
    const before = Date.now();

    const result = await service.login(user.email, 'correct horse battery');

    const token = result.refreshToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const [userId, hash, expiresAt] = refreshTokens.insert.mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(userId).toBe(user.id);
    expect(hash).toBe(sha256(token));
    const week = 7 * 24 * 3600 * 1000;
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(week - 1000);
    expect(expiresAt.getTime() - before).toBeLessThan(week + 5000);
  });

  it('gives a different refresh token on every login', async () => {
    const { service, user } = await setup({}, {});

    const first = await service.login(user.email, 'correct horse battery');
    const second = await service.login(user.email, 'correct horse battery');

    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});

describe('AuthService.refresh', () => {
  const good = {
    consume: { status: 'ok', userId: USER_ID },
  } as const;

  it('swaps a good refresh token for a new access token and a new refresh token', async () => {
    const { service, jwt, refreshTokens, user } = await setup({}, good);

    const result = await service.refresh('old-refresh-token');

    expect(refreshTokens.consume).toHaveBeenCalledWith(
      sha256('old-refresh-token'),
    );
    const payload = await jwt.verifyAsync<{ sub: string; email: string }>(
      result.accessToken,
    );
    expect(payload).toMatchObject({ sub: user.id, email: user.email });
    expect(result.expiresIn).toBe(3600);
    expect(result.refreshToken).toBeDefined();
    expect(result.refreshToken).not.toBe('old-refresh-token');
    expect(refreshTokens.insert).toHaveBeenCalledTimes(1);
  });

  it('rejects an unknown or expired token and issues nothing', async () => {
    const { service, refreshTokens } = await setup(
      {},
      { consume: { status: 'invalid' } },
    );

    await messageOf(service.refresh('nope'));

    expect(refreshTokens.insert).not.toHaveBeenCalled();
    expect(refreshTokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('treats a token that is used again as theft: revokes every token of that user and rejects', async () => {
    const { service, refreshTokens, user } = await setup(
      {},
      { consume: { status: 'reused', userId: USER_ID } },
    );

    await messageOf(service.refresh('stolen'));

    expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith(user.id);
    expect(refreshTokens.insert).not.toHaveBeenCalled();
  });

  it('rejects a user who was deactivated since login, and issues nothing', async () => {
    const { service, refreshTokens } = await setup({ isActive: false }, good);

    await messageOf(service.refresh('old-refresh-token'));

    expect(refreshTokens.insert).not.toHaveBeenCalled();
  });

  it('rejects a token whose user no longer exists', async () => {
    const { service } = await setup(
      {},
      {
        consume: { status: 'ok', userId: 'deleted-user' },
      },
    );

    await messageOf(service.refresh('old-refresh-token'));
  });

  it('gives the same message for every failure', async () => {
    const invalid = await setup({}, {});
    const inactive = await setup({ isActive: false }, good);

    const messages = await Promise.all([
      messageOf(invalid.service.refresh('x')),
      messageOf(inactive.service.refresh('x')),
    ]);

    expect(new Set(messages).size).toBe(1);
  });
});

describe('AuthService.logout', () => {
  it('revokes the token by its hash', async () => {
    const { service, refreshTokens } = await setup({}, {});

    await service.logout('my-refresh-token');

    expect(refreshTokens.revoke).toHaveBeenCalledWith(
      sha256('my-refresh-token'),
    );
  });
});

describe('AuthService.profile', () => {
  it('returns who the user is from the database, with the names and nothing else', async () => {
    const { service, user } = await setup();

    await expect(service.profile(user.id)).resolves.toEqual({
      id: user.id,
      email: user.email,
      firstName: 'Ana',
      lastName: 'García',
      language: 'es',
    });
  });

  it('rejects a token whose user no longer exists', async () => {
    const { service } = await setup();

    await messageOf(service.profile('deleted-user'));
  });

  it('rejects a user who was deactivated since the token was issued', async () => {
    const { service, user } = await setup({ isActive: false });

    await messageOf(service.profile(user.id));
  });
});

describe('AuthService.setLanguage', () => {
  it('saves the language and answers with the profile', async () => {
    const { service, user, users } = await setup();

    await expect(service.setLanguage(user.id, 'en')).resolves.toMatchObject({
      id: user.id,
    });
    expect(users.setLanguage).toHaveBeenCalledWith(user.id, 'en');
  });

  it('rejects a user that does not exist or is archived', async () => {
    const { service, users } = await setup();
    users.setLanguage.mockResolvedValueOnce(false);

    await messageOf(service.setLanguage('deleted-user', 'en'));
  });
});
