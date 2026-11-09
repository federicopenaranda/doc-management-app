import { bootstrapStatements, quoteIdent } from './db-bootstrap.mjs';

describe('quoteIdent', () => {
  it('double-quotes an identifier and doubles embedded quotes', () => {
    expect(quoteIdent('backend-run@p.iam')).toBe('"backend-run@p.iam"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });
});

describe('bootstrapStatements', () => {
  const iamUser = 'backend-run@doc-management-sandbox.iam';
  const sql = bootstrapStatements(iamUser);
  const table = sql.find((s) =>
    s.includes('CREATE TABLE IF NOT EXISTS prueba'),
  );
  const users = sql.find((s) => s.includes('CREATE TABLE IF NOT EXISTS users'));

  it('creates the vector extension and the prueba table only when missing (safe to run twice)', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS vector');
    expect(table).toMatch(/CREATE TABLE IF NOT EXISTS prueba/);
  });

  it('gives prueba an identity id, a required message and a creation time', () => {
    expect(table).toMatch(/id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY/);
    expect(table).toMatch(/mensaje text NOT NULL/);
    expect(table).toMatch(/created_at timestamptz NOT NULL DEFAULT now\(\)/);
  });

  it('lets only the backend identity read and write prueba, with the name quoted', () => {
    const grant = sql.find(
      (s) => s.startsWith('GRANT') && s.includes('ON prueba'),
    );

    expect(grant).toBe(`GRANT SELECT, INSERT ON prueba TO "${iamUser}"`);
  });

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
    const add = sql.filter((s) => s.startsWith('ALTER TABLE users'));

    expect(add).toEqual([
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT ''",
    ]);
    expect(sql.indexOf(add[0])).toBeGreaterThan(sql.indexOf(users));
  });

  it('lets the backend identity read and add users, never change or delete them (that comes later)', () => {
    const grant = sql.find(
      (s) => s.startsWith('GRANT') && s.includes('ON users'),
    );

    expect(grant).toBe(`GRANT SELECT, INSERT ON users TO "${iamUser}"`);
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

  it('inserts one starter row only when the table is empty', () => {
    const insert = sql.find((s) => s.startsWith('INSERT'));

    expect(insert).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM prueba\)/);
  });

  it('refuses a user name with a quote or a semicolon', () => {
    expect(() => bootstrapStatements('x";DROP TABLE prueba;--')).toThrow(
      'DB user',
    );
  });
});
