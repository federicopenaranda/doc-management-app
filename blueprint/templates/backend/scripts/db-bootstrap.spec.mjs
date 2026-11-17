import { bootstrapStatements, quoteIdent } from './db-bootstrap.mjs';

describe('quoteIdent', () => {
  it('double-quotes an identifier and doubles embedded quotes', () => {
    expect(quoteIdent('backend-run@p.iam')).toBe('"backend-run@p.iam"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('bootstrapStatements', () => {
  const iamUser = 'backend-run@__PROJECT_NAME__-sandbox.iam';
  const sql = bootstrapStatements(iamUser);
  it('creates the vector extension only when missing (safe to run twice)', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
  });

  const users = sql.find((s) => s.includes('CREATE TABLE IF NOT EXISTS users'));

  it('creates the users table: uuid id, required email and password hash, active flag, creation time', () => {
    expect(users).toMatch(/id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
    expect(users).toMatch(/email text NOT NULL/);
    expect(users).toMatch(/password_hash text NOT NULL/);
    expect(users).toMatch(/is_active boolean NOT NULL DEFAULT true/);
    expect(users).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('makes the email unique whatever its letter case', () => {
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))',
    );
  });

  it('adds first and last name to users, safe to repeat and keeping the rows that exist', () => {
    const add = sql.filter(
      (s) =>
        s.startsWith('ALTER TABLE users') && /first_name|last_name/.test(s),
    );

    expect(add).toEqual([
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT ''",
    ]);
    expect(sql.indexOf(add[0])).toBeGreaterThan(sql.indexOf(users));
  });

  it('adds archived_at and archived_by to users: when a user was archived and by whom, so the history is kept', () => {
    expect(sql).toContain(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz',
    );
    expect(sql).toContain(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id)',
    );
  });

  it('adds a language to users (SCRUM-19): English or Spanish, English for everyone who exists', () => {
    const add = sql.find((s) =>
      s.includes('ADD COLUMN IF NOT EXISTS language'),
    );

    expect(add).toBe(
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es'))",
    );
    expect(sql.indexOf(add)).toBeGreaterThan(
      sql.findIndex((s) => s.startsWith('CREATE TABLE IF NOT EXISTS users')),
    );
  });

  it('makes Spanish the default language of new users (SCRUM-32) and leaves existing rows alone', () => {
    const setDefault = sql.find((s) =>
      s.includes('ALTER COLUMN language SET DEFAULT'),
    );

    expect(setDefault).toBe(
      "ALTER TABLE users ALTER COLUMN language SET DEFAULT 'es'",
    );
    expect(sql.indexOf(setDefault)).toBeGreaterThan(
      sql.findIndex((s) => s.includes('ADD COLUMN IF NOT EXISTS language')),
    );
    expect(sql.filter((s) => /^UPDATE users/i.test(s))).toEqual([]);
  });

  it('never gives the backend identity the right to delete rows (users are archived, not deleted)', () => {
    expect(sql.filter((s) => /DELETE/i.test(s))).toEqual([]);
  });

  it('lets the backend identity read, add and update users, never delete them', () => {
    const grant = sql.find(
      (s) => s.startsWith('GRANT') && s.includes('ON users'),
    );

    expect(grant).toBe(`GRANT SELECT, INSERT, UPDATE ON users TO "${iamUser}"`);
  });

  describe('refresh_tokens', () => {
    const refresh = sql.find((s) =>
      s.includes('CREATE TABLE IF NOT EXISTS refresh_tokens'),
    );

    it('stores only a unique hash of each token, its owner, its expiry and when it was used', () => {
      expect(refresh).toMatch(
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      );
      expect(refresh).toMatch(/user_id uuid NOT NULL REFERENCES users\(id\)/);
      expect(refresh).toMatch(/token_hash text NOT NULL UNIQUE/);
      expect(refresh).toMatch(/expires_at timestamptz NOT NULL/);
      expect(refresh).toMatch(/used_at timestamptz(?! NOT NULL)/);
      expect(refresh).not.toMatch(/token text/);
    });

    it('lets the backend identity read, add and update tokens, never delete them', () => {
      const grant = sql.find(
        (s) => s.startsWith('GRANT') && s.includes('ON refresh_tokens'),
      );

      expect(grant).toBe(
        `GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO "${iamUser}"`,
      );
    });

    it('is created after users, which it points to', () => {
      expect(sql.indexOf(refresh)).toBeGreaterThan(sql.indexOf(users));
    });
  });

  it('refuses a user name with a quote or a semicolon', () => {
    expect(() => bootstrapStatements('x";DROP TABLE users;--')).toThrow(
      'DB user',
    );
  });
});
