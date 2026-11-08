import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { hashPassword, verifyPassword } from './password.js';
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

async function setup(overrides: Partial<UserRecord> = {}) {
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
  const jwt = new JwtService({ secret: SECRET });
  const service = new AuthService(
    { findByEmail } as unknown as UsersRepository,
    jwt,
  );
  return { service, jwt, findByEmail, user };
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
