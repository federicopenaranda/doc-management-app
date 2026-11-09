#!/usr/bin/env node
// Creates an app user (email + hashed password) as the built-in `postgres` admin. Safe to repeat:
// an email that already exists is left untouched. Used until the user screens exist (SCRUM-18).
//
//   USER_PASSWORD=... DB_ADMIN_PASSWORD=... npm run users:create -- \
//     --instance <project>:<region>:<instance> --email someone@example.com
//
// Same setup as db:bootstrap (see infrastructure/README.md): application-default login and a temporary
// postgres password. Runs on Node 24, which runs the TypeScript hashing code directly. Never prints passwords.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { hashPassword } from '../src/auth/password.ts';
import { withAdminClient } from './admin-connection.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 12;
const MAX_PASSWORD = 200; // the login endpoint accepts no more than this

/** @param {{ email: string, password: string }} input @returns {{ email: string }} */
export function validateNewUser({ email, password }) {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL.test(normalized)) throw new Error('That is not a valid email');
  // The messages never include the password.
  if (password.length < MIN_PASSWORD) {
    throw new Error(`The password needs at least ${MIN_PASSWORD} characters`);
  }
  if (password.length > MAX_PASSWORD) {
    throw new Error(`The password can have at most ${MAX_PASSWORD} characters`);
  }
  return { email: normalized };
}

/** The INSERT with bound parameters: the password is hashed here and never leaves this function. */
export async function buildInsert(email, password, { reset = false } = {}) {
  const onConflict = reset
    ? 'DO UPDATE SET password_hash = EXCLUDED.password_hash'
    : 'DO NOTHING';
  return {
    text: `INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (lower(email)) ${onConflict} RETURNING id`,
    values: [email, await hashPassword(password)],
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      instance: { type: 'string' },
      database: { type: 'string', default: 'dms' },
      email: { type: 'string' },
      reset: { type: 'boolean', default: false },
    },
  });
  const adminPassword = process.env.DB_ADMIN_PASSWORD;
  const userPassword = process.env.USER_PASSWORD;
  if (!values.instance || !values.email || !adminPassword || !userPassword) {
    throw new Error(
      'Pass --instance and --email, and set DB_ADMIN_PASSWORD and USER_PASSWORD in the environment',
    );
  }
  const { email } = validateNewUser({
    email: values.email,
    password: userPassword,
  });
  const insert = await buildInsert(email, userPassword, {
    reset: values.reset,
  });

  await withAdminClient(
    {
      instance: values.instance,
      database: values.database,
      password: adminPassword,
    },
    async (client) => {
      const { rowCount } = await client.query(insert);
      console.log(
        rowCount === 1
          ? `users:create ok: ${email} ${values.reset ? 'saved (new password if it already existed)' : 'created'}`
          : `users:create: ${email} already exists, nothing changed`,
      );
    },
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`users:create failed: ${error.message}`);
    process.exit(1);
  });
}
