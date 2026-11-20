#!/usr/bin/env node
// One-time (and safe to repeat) database setup, run by the owner as the built-in `postgres` admin:
// creates the pgvector extension, the `prueba` test table, the `users` table and the `refresh_tokens` table, and
// gives the backend's IAM user the access it needs (read and write prueba, read/add/update users, read/add/update refresh_tokens).
//
//   DB_ADMIN_PASSWORD=... npm run db:bootstrap -- \
//     --instance <project>:<region>:<instance> --iam-user <service-account-email-without-.gserviceaccount.com>
//
// Needs `gcloud auth application-default login` (an account with roles/cloudsql.client) and the
// postgres password in DB_ADMIN_PASSWORD (see infrastructure/README.md). Never prints the password.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { withAdminClient } from './admin-connection.mjs';

/** @param {string} name */
export function quoteIdent(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * The SQL to run, in order. Every statement can run twice without harm.
 * @param {string} iamUser Cloud SQL IAM user, e.g. backend-run@my-project.iam
 * @returns {string[]}
 */
export function bootstrapStatements(iamUser) {
  // The name goes into a GRANT, so only the characters of a service account email are allowed.
  if (!/^[A-Za-z0-9._@-]+$/.test(iamUser)) {
    throw new Error('DB user may only contain letters, digits and . _ @ -');
  }
  return [
    'CREATE EXTENSION IF NOT EXISTS vector',
    `CREATE TABLE IF NOT EXISTS prueba (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mensaje text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `GRANT SELECT, INSERT ON prueba TO ${quoteIdent(iamUser)}`,
    // App users. Passwords are stored only as scrypt hashes (see src/auth/password.ts).
    `CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key ON users (lower(email))',
    // Names came with the user screens (SCRUM-18); users that already exist get empty names.
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT ''",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name text NOT NULL DEFAULT ''",
    // A user is archived, never deleted: the row, its email and its history stay. Null means not archived.
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at timestamptz',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES users(id)',
    // The user's language preference (SCRUM-19); everyone who existed then has English (the default is changed to Spanish below).
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es'))",
    // New users start in Spanish (SCRUM-32); this changes only the default, existing rows keep their value.
    "ALTER TABLE users ALTER COLUMN language SET DEFAULT 'es'",
    // Login reads users, the user screens add and edit them; deleting them comes with the next tickets.
    `GRANT SELECT, INSERT, UPDATE ON users TO ${quoteIdent(iamUser)}`,
    // Refresh tokens: only a hash is stored. A used or revoked token keeps its row (used_at) so a replay can be told
    // from an unknown token. Rows are never deleted by the app; shortcut: expired rows pile up, add a cleanup job when it matters.
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `GRANT SELECT, INSERT, UPDATE ON refresh_tokens TO ${quoteIdent(iamUser)}`,
    // Clients: a client is disabled (disabled_at set), never deleted. Name, prefix (up to 10 characters) and email are
    // required; email and prefix are unique ignoring letter case. The code is optional, but unique when present.
    `CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prefix text NOT NULL CHECK (char_length(prefix) <= 10),
  address text,
  code text,
  phone text,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
)`,
    'CREATE UNIQUE INDEX IF NOT EXISTS clients_code_lower_key ON clients (lower(code)) WHERE code IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS clients_email_lower_key ON clients (lower(email))',
    'CREATE UNIQUE INDEX IF NOT EXISTS clients_prefix_lower_key ON clients (lower(prefix))',
    `GRANT SELECT, INSERT, UPDATE ON clients TO ${quoteIdent(iamUser)}`,
    // Folder of the client's files in the bucket: <name-slug>-<yyyymmdd>-<first 8 of the id>, set once when the client
    // is created and never changed. Clients that exist already get it from the same pieces (SQL cannot strip accents,
    // so an accented letter in an old name becomes a dash).
    'ALTER TABLE clients ADD COLUMN IF NOT EXISTS storage_folder text',
    `UPDATE clients SET storage_folder = coalesce(nullif(left(trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')), 40), ''), 'client') || '-' || to_char(created_at AT TIME ZONE 'UTC', 'YYYYMMDD') || '-' || left(id::text, 8) WHERE storage_folder IS NULL`,
    'ALTER TABLE clients ALTER COLUMN storage_folder SET NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS clients_storage_folder_key ON clients (storage_folder)',
    // Roles (the four basic ones). A user has one or more; a role taken away is revoked, never deleted (history), because the
    // backend identity has no DELETE right. Everyone who exists when this first runs becomes site_admin, as they could do
    // everything before roles existed.
    `CREATE TABLE IF NOT EXISTS roles (
  key text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `INSERT INTO roles (key, name) VALUES ('viewer', 'Viewer'), ('editor', 'Editor'), ('admin', 'Admin'), ('site_admin', 'Site admin') ON CONFLICT (key) DO NOTHING`,
    `GRANT SELECT ON roles TO ${quoteIdent(iamUser)}`,
    `CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role_key text NOT NULL REFERENCES roles(key),
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES users(id)
)`,
    'CREATE UNIQUE INDEX IF NOT EXISTS user_roles_active_key ON user_roles (user_id, role_key) WHERE revoked_at IS NULL',
    `GRANT SELECT, INSERT, UPDATE ON user_roles TO ${quoteIdent(iamUser)}`,
    // One client per user (roles apply inside it); site admins have none.
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id)',
    `INSERT INTO user_roles (user_id, role_key) SELECT u.id, 'site_admin' FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.revoked_at IS NULL)`,
    // Documents: one row per uploaded original, written by the document worker when the file lands in the bucket (so the
    // size is the real one). The path is unique, so a redelivered message updates the row instead of adding another. Never
    // deleted: the backend identity has no DELETE right.
    `CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  storage_path text NOT NULL,
  original_name text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
    'CREATE UNIQUE INDEX IF NOT EXISTS documents_storage_path_key ON documents (storage_path)',
    'CREATE INDEX IF NOT EXISTS documents_client_id_idx ON documents (client_id, created_at DESC)',
    `GRANT SELECT, INSERT, UPDATE ON documents TO ${quoteIdent(iamUser)}`,
    `INSERT INTO prueba (mensaje) SELECT 'hola desde db:bootstrap' WHERE NOT EXISTS (SELECT 1 FROM prueba)`,
  ];
}

async function main() {
  const { values } = parseArgs({
    options: {
      instance: { type: 'string' },
      database: { type: 'string', default: 'dms' },
      'iam-user': { type: 'string' },
    },
  });
  const password = process.env.DB_ADMIN_PASSWORD;
  if (!values.instance || !values['iam-user'] || !password) {
    throw new Error(
      'Pass --instance and --iam-user, and set DB_ADMIN_PASSWORD in the environment',
    );
  }
  const statements = bootstrapStatements(values['iam-user']);

  await withAdminClient(
    { instance: values.instance, database: values.database, password },
    async (client) => {
      for (const statement of statements) await client.query(statement);
    },
  );
  console.log(`db:bootstrap ok: ${statements.length} statements ran`);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    // pg errors never contain the password, but print only the message to be safe.
    console.error(`db:bootstrap failed: ${error.message}`);
    process.exit(1);
  });
}
