#!/usr/bin/env node
// One-time (and safe to repeat) database setup, run by the owner as the built-in `postgres` admin:
// creates the pgvector extension and the `prueba` test table, and lets the backend's IAM user
// read and write it.
//
//   DB_ADMIN_PASSWORD=... npm run db:bootstrap -- \
//     --instance <project>:<region>:<instance> --iam-user <service-account-email-without-.gserviceaccount.com>
//
// Needs `gcloud auth application-default login` (an account with roles/cloudsql.client) and the
// postgres password in DB_ADMIN_PASSWORD (see infrastructure/README.md). Never prints the password.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

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

  // Loaded here so the tests of the pure functions above do not need the database packages.
  const { AuthTypes, Connector } =
    await import('@google-cloud/cloud-sql-connector');
  const { default: pg } = await import('pg');
  const connector = new Connector();
  const options = await connector.getOptions({
    instanceConnectionName: values.instance,
    authType: AuthTypes.PASSWORD,
  });
  const client = new pg.Client({
    ...options,
    user: 'postgres',
    password,
    database: values.database,
  });
  try {
    await client.connect();
    await client.query('BEGIN');
    for (const statement of statements) await client.query(statement);
    await client.query('COMMIT');
    console.log(`db:bootstrap ok: ${statements.length} statements ran`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
    connector.close();
  }
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
