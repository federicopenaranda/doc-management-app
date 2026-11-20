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

  describe('clients', () => {
    const clients = sql.find((s) =>
      s.includes('CREATE TABLE IF NOT EXISTS clients'),
    );

    it('has a uuid id, a required name, prefix and email, optional address, code and phone, and creation, update and disable times', () => {
      expect(clients).toMatch(
        /id uuid PRIMARY KEY DEFAULT gen_random_uuid\(\)/,
      );
      for (const column of ['name', 'prefix', 'email']) {
        expect(clients).toMatch(new RegExp(`${column} text NOT NULL`));
      }
      expect(clients).toMatch(/CHECK \(char_length\(prefix\) <= 10\)/);
      for (const column of ['address', 'code', 'phone']) {
        expect(clients).toMatch(new RegExp(`${column} text(?! NOT NULL)`));
      }
      expect(clients).toMatch(
        /created_at timestamptz NOT NULL DEFAULT now\(\)/,
      );
      expect(clients).toMatch(
        /updated_at timestamptz NOT NULL DEFAULT now\(\)/,
      );
      expect(clients).toMatch(/disabled_at timestamptz(?! NOT NULL)/);
    });

    it('keeps a code unique ignoring letter case, only when there is one', () => {
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS clients_code_lower_key ON clients (lower(code)) WHERE code IS NOT NULL',
      );
    });

    it('keeps the email and the prefix unique ignoring letter case', () => {
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS clients_email_lower_key ON clients (lower(email))',
      );
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS clients_prefix_lower_key ON clients (lower(prefix))',
      );
    });

    it('lets the backend identity read, add and update clients, never delete them', () => {
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE ON clients TO "${iamUser}"`,
      );
    });

    it('gives a client a unique storage folder: added, filled for old clients, then required and unique', () => {
      const at = (text) => sql.findIndex((s) => s.includes(text));
      const add =
        'ALTER TABLE clients ADD COLUMN IF NOT EXISTS storage_folder text';
      const backfill = sql.find(
        (s) =>
          s.startsWith('UPDATE clients SET storage_folder') &&
          s.includes('WHERE storage_folder IS NULL'),
      );
      const required =
        'ALTER TABLE clients ALTER COLUMN storage_folder SET NOT NULL';
      const unique =
        'CREATE UNIQUE INDEX IF NOT EXISTS clients_storage_folder_key ON clients (storage_folder)';

      expect(sql).toContain(add);
      expect(backfill).toBeDefined();
      expect(sql).toContain(required);
      expect(sql).toContain(unique);
      expect(at(add)).toBeGreaterThan(
        at('CREATE TABLE IF NOT EXISTS clients'),
      );
      expect(at(backfill)).toBeGreaterThan(at(add));
      expect(at(required)).toBeGreaterThan(at(backfill));
      expect(at(unique)).toBeGreaterThan(at(required));
    });
  });

  it('inserts one starter row only when the table is empty', () => {
    const insert = sql.find((s) => s.startsWith('INSERT INTO prueba'));

    expect(insert).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM prueba\)/);
  });

  describe('roles', () => {
    const roles = sql.find((s) =>
      s.includes('CREATE TABLE IF NOT EXISTS roles'),
    );
    const userRoles = sql.find((s) =>
      s.includes('CREATE TABLE IF NOT EXISTS user_roles'),
    );
    const at = (text) => sql.findIndex((s) => s.includes(text));

    it('has the role key as its primary key and a required name', () => {
      expect(roles).toMatch(/key text PRIMARY KEY/);
      expect(roles).toMatch(/name text NOT NULL/);
    });

    it('seeds the four roles, and can run twice', () => {
      const seed = sql.find((s) => s.startsWith('INSERT INTO roles'));

      for (const key of ['viewer', 'editor', 'admin', 'site_admin']) {
        expect(seed).toContain(`'${key}'`);
      }
      expect(seed).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    });

    it('assigns a role to a user with who granted it and when, and keeps a revoked row (history)', () => {
      expect(userRoles).toMatch(/user_id uuid NOT NULL REFERENCES users\(id\)/);
      expect(userRoles).toMatch(
        /role_key text NOT NULL REFERENCES roles\(key\)/,
      );
      expect(userRoles).toMatch(
        /granted_at timestamptz NOT NULL DEFAULT now\(\)/,
      );
      expect(userRoles).toMatch(/granted_by uuid REFERENCES users\(id\)/);
      expect(userRoles).toMatch(/revoked_at timestamptz(?! NOT NULL)/);
      expect(userRoles).toMatch(/revoked_by uuid REFERENCES users\(id\)/);
    });

    it('allows one active row per user and role, but many revoked ones', () => {
      expect(sql).toContain(
        'CREATE UNIQUE INDEX IF NOT EXISTS user_roles_active_key ON user_roles (user_id, role_key) WHERE revoked_at IS NULL',
      );
    });

    it('gives a user an optional client, after the clients table exists', () => {
      const alter =
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id)';

      expect(sql).toContain(alter);
      expect(at(alter)).toBeGreaterThan(
        at('CREATE TABLE IF NOT EXISTS clients'),
      );
    });

    it('gives every user that has no active role the site_admin role, so nobody is left without one', () => {
      const backfill = sql.find((s) => s.startsWith('INSERT INTO user_roles'));

      expect(backfill).toMatch(/'site_admin'/);
      expect(backfill).toMatch(/NOT EXISTS/);
      expect(backfill).toMatch(/revoked_at IS NULL/);
      expect(at(backfill)).toBeGreaterThan(at('INSERT INTO roles'));
    });

    it('is created after users and roles, which it points to', () => {
      expect(sql.indexOf(userRoles)).toBeGreaterThan(sql.indexOf(roles));
      expect(sql.indexOf(roles)).toBeGreaterThan(sql.indexOf(users));
    });

    it('lets the backend identity read the roles, and read, add and update the assignments', () => {
      expect(sql).toContain(`GRANT SELECT ON roles TO "${iamUser}"`);
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE ON user_roles TO "${iamUser}"`,
      );
    });
  });

  it('refuses a user name with a quote or a semicolon', () => {
    expect(() => bootstrapStatements('x";DROP TABLE prueba;--')).toThrow(
      'DB user',
    );
  });
});
