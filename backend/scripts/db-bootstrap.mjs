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
