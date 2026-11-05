#!/usr/bin/env node
// Local development only: downloads the latest version of the frontend's Secret Manager secret
// (frontend-<env>, a flat JSON object) and writes it as public/config.json.
//
//   npm run config:pull -- --env local --project <gcp-project-id>
//
// config.json is served to the browser, so the secret must hold public values only.
// Needs `gcloud auth application-default login` and access to the secret.
import { writeFile as fsWriteFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ENVIRONMENTS = ['local', 'sandbox', 'prod'];

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
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`"${key}" must be a string, number or boolean`);
    }
  }
  return data;
}

/** @param {string} env */
export function secretName(env) {
  if (!ENVIRONMENTS.includes(env)) {
    throw new Error(`Unknown environment "${env}" (expected one of: ${ENVIRONMENTS.join(', ')})`);
  }
  return `frontend-${env}`;
}

/** @param {string | undefined} fromFlag @param {string | undefined} fromEnv */
export function requireProject(fromFlag, fromEnv) {
  const project = fromFlag ?? fromEnv;
  if (!project) {
    throw new Error('Pass --project <gcp-project-id> or set GOOGLE_CLOUD_PROJECT');
  }
  return project;
}

/**
 * Validates the secret before touching the disk: an invalid secret never produces a partial file.
 * @returns {Promise<{ file: string, keys: string[] }>}
 */
export async function pullConfig({ env, project, out, client, writeFile }) {
  const name = secretName(env);
  const [version] = await client.accessSecretVersion({
    name: `projects/${project}/secrets/${name}/versions/latest`,
  });
  let values;
  try {
    values = parseSecretJson(Buffer.from(version.payload.data).toString('utf8'));
  } catch (error) {
    throw new Error(`${name}: ${error.message}`);
  }
  await writeFile(out, `${JSON.stringify(values, null, 2)}\n`);
  return { file: out, keys: Object.keys(values) };
}

async function main() {
  const { values } = parseArgs({
    options: {
      env: { type: 'string', default: 'local' },
      project: { type: 'string' },
      out: { type: 'string', default: 'public/config.json' },
    },
  });
  const project = requireProject(values.project, process.env.GOOGLE_CLOUD_PROJECT);
  const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
  const { file, keys } = await pullConfig({
    env: values.env,
    project,
    out: values.out,
    client: new SecretManagerServiceClient(),
    writeFile: (path, content) => fsWriteFile(path, content),
  });
  console.log(`Wrote ${file} with ${keys.length} keys: ${keys.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`config:pull failed: ${error.message}`);
    process.exit(1);
  });
}
