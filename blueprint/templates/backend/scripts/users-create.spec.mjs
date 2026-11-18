import { verifyPassword } from '../src/auth/password.ts';
import { buildGrant, buildInsert, validateNewUser } from './users-create.mjs';

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

describe('buildGrant', () => {
  it('gives the site_admin role to a user that has no active role, and never to one that has', () => {
    const { text, values } = buildGrant('ana@example.com');

    expect(text).toMatch(/^INSERT INTO user_roles \(user_id, role_key\)/);
    expect(text).toContain("'site_admin'");
    expect(text).toMatch(
      /NOT EXISTS \(SELECT 1 FROM user_roles r WHERE r\.user_id = u\.id AND r\.revoked_at IS NULL\)/,
    );
    expect(text).toContain('lower(u.email) = lower($1)');
    expect(values).toEqual(['ana@example.com']);
  });
});
