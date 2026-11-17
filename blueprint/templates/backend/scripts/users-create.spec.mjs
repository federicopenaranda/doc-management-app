import { verifyPassword } from '../src/auth/password.ts';
import { buildInsert, validateNewUser } from './users-create.mjs';

describe('validateNewUser', () => {
  it('returns the email trimmed and lower-cased', () => {
    expect(
      validateNewUser({
        email: '  Ana@Example.COM ',
        password: 'a long enough password',
      }),
    ).toEqual({ email: 'ana@example.com' });
  });

  it.each(['', 'not-an-email', 'a@b', 'two words@example.com'])(
    'rejects the email %j',
    (email) => {
      expect(() =>
        validateNewUser({ email, password: 'a long enough password' }),
      ).toThrow('email');
    },
  );

  it('rejects a password shorter than 12 characters, without echoing it', () => {
    const message = (() => {
      try {
        validateNewUser({ email: 'ana@example.com', password: 'short-pw' });
      } catch (error) {
        return error.message;
      }
      return '';
    })();

    expect(message).toContain('12');
    expect(message).not.toContain('short-pw');
  });

  it('rejects a password longer than 200 characters (the login limit)', () => {
    expect(() =>
      validateNewUser({ email: 'ana@example.com', password: 'x'.repeat(201) }),
    ).toThrow('200');
  });
});

describe('buildInsert', () => {
  it('inserts with bound parameters and skips an email that already exists', async () => {
    const { text } = await buildInsert(
      'ana@example.com',
      'a long enough password',
    );

    expect(text).toBe(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (lower(email)) DO NOTHING RETURNING id',
    );
  });

  it('with reset, replaces only the password hash of an email that already exists', async () => {
    const { text, values } = await buildInsert(
      'ana@example.com',
      'a long enough password',
      { reset: true },
    );

    expect(text).toBe(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash RETURNING id',
    );
    expect(values[1]).toMatch(/^scrypt\$/);
  });

  it('stores a scrypt hash that verifies, never the password', async () => {
    const password = 'a long enough password';

    const { values } = await buildInsert('ana@example.com', password);

    expect(values[0]).toBe('ana@example.com');
    expect(values[1]).toMatch(/^scrypt\$/);
    expect(values[1]).not.toContain(password);
    expect(await verifyPassword(password, values[1])).toBe(true);
  });
});
