// Builds the backend image and runs real containers against it. Needs a running Docker daemon.
//   npm run test:image                          builds the image itself
//   BACKEND_IMAGE=my-tag npm run test:image     tests an image that is already built
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const image = process.env.BACKEND_IMAGE ?? 'dms-backend-image-test';
const SECRET = 'super-secret-value-0123456789-abcdefghij';

// What the mounted Secret Manager secret (backend-sandbox) holds.
const config = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/dms',
  JWT_SECRET: SECRET,
  GCS_BUCKET: 'dms-documents',
  FRONTEND_URLS: 'http://localhost:4200',
};

const docker = (...args) =>
  execFileSync('docker', args, { encoding: 'utf8' }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'backend-image-'));
const started = [];

function mountArgs(secret) {
  if (secret === undefined) return [];
  const file = join(tmp, `secret-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(
    file,
    typeof secret === 'string' ? secret : JSON.stringify(secret),
  );
  return [
    '-v',
    `${file}:/secrets/config.json:ro`,
    '-e',
    'APP_CONFIG_FILE=/secrets/config.json',
  ];
}

const envArgs = (env) =>
  Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]);

/** Starts a container and waits until /health answers; returns its id and base URL. */
async function start({ env = {}, secret = config } = {}) {
  const id = docker(
    'run',
    '-d',
    '-p',
    '127.0.0.1::8080',
    ...envArgs(env),
    ...mountArgs(secret),
    image,
  );
  started.push(id);
  const url = `http://127.0.0.1:${docker('port', id, '8080/tcp').split(':').pop()}`;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return { id, url };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.fail(`container did not become healthy: ${docker('logs', id)}`);
}

/** Runs a container that is expected to exit, returns its exit code and output. */
function runToExit({ env = {}, secret } = {}) {
  const result = spawnSync(
    'docker',
    ['run', '--rm', ...envArgs(env), ...mountArgs(secret), image],
    {
      encoding: 'utf8',
      timeout: 60000,
    },
  );
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

before(() => {
  if (!process.env.BACKEND_IMAGE) docker('build', '-t', image, backendDir);
});

after(() => {
  for (const id of started) spawnSync('docker', ['rm', '-f', id]);
  rmSync(tmp, { recursive: true, force: true });
});

describe('backend image', () => {
  it('boots from the mounted secret alone and answers / and /health', async () => {
    const { url } = await start();

    assert.equal(await (await fetch(`${url}/`)).text(), 'Hello World!');
    assert.equal((await (await fetch(`${url}/health`)).json()).status, 'ok');
  });

  it('lets a plain environment variable win over the same key in the secret (CORS shows it)', async () => {
    const { url } = await start({
      env: { FRONTEND_URLS: 'https://front.example' },
    });

    const allowed = await fetch(`${url}/`, {
      headers: { Origin: 'https://front.example' },
    });
    const fromFile = await fetch(`${url}/`, {
      headers: { Origin: 'http://localhost:4200' },
    });

    assert.equal(
      allowed.headers.get('access-control-allow-origin'),
      'https://front.example',
    );
    assert.equal(fromFile.headers.get('access-control-allow-origin'), null);
  });

  it('sets security headers', async () => {
    const { url } = await start();

    assert.equal(
      (await fetch(`${url}/`)).headers.get('x-content-type-options'),
      'nosniff',
    );
  });

  it('logs JSON to stdout and never prints secret values', async () => {
    const { id, url } = await start();
    await fetch(`${url}/`, { headers: { Authorization: `Bearer ${SECRET}` } });

    const lines = docker('logs', id).split('\n').filter(Boolean);

    assert.ok(lines.length > 0);
    for (const line of lines) JSON.parse(line);
    assert.ok(!lines.join('\n').includes(SECRET));
  });

  it('refuses to start without configuration, naming the missing variables', () => {
    const { code, output } = runToExit();

    assert.notEqual(code, 0);
    assert.match(output, /DATABASE_URL/);
  });

  it('refuses to start on an invalid key in the mounted secret, without printing values', () => {
    const { code, output } = runToExit({
      secret: { ...config, log_level: SECRET },
    });

    assert.notEqual(code, 0);
    assert.match(output, /APP_CONFIG_FILE/);
    assert.match(output, /log_level/);
    assert.ok(!output.includes(SECRET));
  });

  it('ships no dev dependencies and no local .env file', () => {
    const out = docker(
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      'test ! -e .env && test ! -d node_modules/vitest && test ! -d node_modules/pino-pretty && echo clean',
    );

    assert.equal(out, 'clean');
  });

  it('does not run as root', () => {
    assert.notEqual(
      docker('run', '--rm', '--entrypoint', 'id', image, '-u'),
      '0',
    );
  });
});
