#!/usr/bin/env node
// Local development only: downloads the latest version of the backend's Secret Manager secret
// (backend-<env>, a flat JSON object) and writes it as a .env file.
//
//   npm run env:pull -- --env local --project <gcp-project-id>
//
// Needs `gcloud auth application-default login` and access to the secret.
// Prints variable names, never values.
import { writeFile as fsWriteFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ENVIRONMENTS = ['local', 'sandbox', 'prod'];
const KEY = /^[A-Z_][A-Z0-9_]*$/;

/** @param {string} text @returns {Record<string, string | number | boolean>} */
export function parseSecretJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // JSON.parse messages can quote the input, so never forward them.
    throw new Error('The secret is not valid JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('The secret must be a JSON object');
  }
  for (const [key, value] of Object.entries(data)) {
    if (!KEY.test(key)) {
      throw new Error(
        `Invalid variable name ${JSON.stringify(key)}: use UPPER_SNAKE_CASE`,
      );
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`"${key}" must be a string, number or boolean`);
    }
  }
  return data;
}

/** dotenv (used by @nestjs/config) only unescapes \n and \r inside double quotes, so pick a quote style that round-trips. */
function quote(key, value) {
  const text = String(value);
  if (!/[\r\n]/.test(text) && !text.includes("'")) return `'${text}'`;
  if (!/[\r\n]/.test(text) && !text.includes('`')) return `\`${text}\``;
  if (!text.includes('"') && !/\\[nr]/.test(text)) {
    return `"${text.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
  }
  throw new Error(`The value of ${key} cannot be written to a .env file`);
}

/** @param {Record<string, string | number | boolean>} values */
export function toEnvText(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${quote(key, value)}`)
    .join('\n')}\n`;
}

/** @param {string} env */
export function secretName(env) {
  if (!ENVIRONMENTS.includes(env)) {
    throw new Error(
      `Unknown environment "${env}" (expected one of: ${ENVIRONMENTS.join(', ')})`,
    );
  }
  return `backend-${env}`;
}

/** @param {string | undefined} fromFlag @param {string | undefined} fromEnv */
export function requireProject(fromFlag, fromEnv) {
  const project = fromFlag ?? fromEnv;
  if (!project) {
    throw new Error(
      'Pass --project <gcp-project-id> or set GOOGLE_CLOUD_PROJECT',
    );
  }
  return project;
}

/**
 * Validates the secret before touching the disk: an invalid secret never produces a partial .env.
 * @returns {Promise<{ file: string, keys: string[] }>}
 */
export async function pullEnv({ env, project, out, client, writeFile }) {
  const name = secretName(env);
  const [version] = await client.accessSecretVersion({
    name: `projects/${project}/secrets/${name}/versions/latest`,
  });
  let values;
  try {
    values = parseSecretJson(
      Buffer.from(version.payload.data).toString('utf8'),
    );
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
  await writeFile(out, toEnvText(values));
  return { file: out, keys: Object.keys(values) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      env: { type: 'string', default: 'local' },
      project: { type: 'string' },
      out: { type: 'string', default: '.env' },
    },
  });
  const project = requireProject(
    values.project,
    process.env.GOOGLE_CLOUD_PROJECT,
  );
  const { SecretManagerServiceClient } =
    await import('@google-cloud/secret-manager');
  const { file, keys } = await pullEnv({
    env: values.env,
    project,
    out: values.out,
    client: new SecretManagerServiceClient(),
    writeFile: (path, content) => fsWriteFile(path, content, { mode: 0o600 }),
  });
  console.log(
    `Wrote ${file} with ${keys.length} variables: ${keys.join(', ')}`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(`env:pull failed: ${error.message}`);
    process.exit(1);
  });
}
