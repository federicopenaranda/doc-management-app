// Builds the frontend image and runs real containers against it. Needs a running Docker daemon.
//   npm run test:image                      builds the image itself
//   FRONTEND_IMAGE=my-tag npm run test:image   tests an image that is already built
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const image = process.env.FRONTEND_IMAGE ?? 'dms-frontend-image-test';
const SECRET = 'super-secret-value-123';

const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8' }).trim();
const tmp = mkdtempSync(join(tmpdir(), 'frontend-image-'));
const started = [];

/** Starts a container and waits until it answers; returns its base URL. */
async function start({ env = {}, secret } = {}) {
  const args = ['run', '-d', '-p', '127.0.0.1::8080'];
  for (const [key, value] of Object.entries(env)) args.push('-e', `${key}=${value}`);
  if (secret !== undefined) {
    const file = join(tmp, `secret-${started.length}.json`);
    writeFileSync(file, secret);
    args.push(
      '-v',
      `${file}:/secrets/config.json:ro`,
      '-e',
      'APP_CONFIG_FILE=/secrets/config.json',
    );
  }
  const id = docker(...args, image);
  started.push(id);
  const port = docker('port', id, '8080/tcp').split(':').pop();
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await fetch(url);
      return url;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  assert.fail(`container did not start: ${docker('logs', id)}`);
}

/** Runs a container that is expected to exit, returns its exit code and output. */
function runToExit({ env = {}, secret } = {}) {
  const args = ['run', '--rm'];
  for (const [key, value] of Object.entries(env)) args.push('-e', `${key}=${value}`);
  if (secret !== undefined) {
    const file = join(tmp, `secret-exit-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, secret);
    args.push(
      '-v',
      `${file}:/secrets/config.json:ro`,
      '-e',
      'APP_CONFIG_FILE=/secrets/config.json',
    );
  }
  const result = spawnSync('docker', [...args, image], { encoding: 'utf8', timeout: 30000 });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

before(() => {
  if (!process.env.FRONTEND_IMAGE) docker('build', '-t', image, frontendDir);
});

after(() => {
  for (const id of started) spawnSync('docker', ['rm', '-f', id]);
  rmSync(tmp, { recursive: true, force: true });
});

describe('frontend image', () => {
  it('serves the Angular app and falls back to index.html for client-side routes', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });

    for (const path of ['/', '/some/deep/route']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), /<dms-root/, path);
    }
  });

  it('writes config.json from API_URL and never lets it be cached', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });

    const response = await fetch(`${url}/config.json`);

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.deepEqual(await response.json(), { apiUrl: 'https://api.example.com' });
  });

  it('merges the mounted secret and lets API_URL win over its apiUrl', async () => {
    const url = await start({
      env: { API_URL: 'https://api.example.com' },
      secret: '{"apiUrl":"http://localhost:3000","featureX":true}',
    });

    assert.deepEqual(await (await fetch(`${url}/config.json`)).json(), {
      apiUrl: 'https://api.example.com',
      featureX: true,
    });
  });

  it('serves the mounted secret alone when API_URL is not set', async () => {
    const url = await start({ secret: '{"apiUrl":"http://localhost:3000"}' });

    assert.deepEqual(await (await fetch(`${url}/config.json`)).json(), {
      apiUrl: 'http://localhost:3000',
    });
  });

  it('refuses to start on invalid JSON, naming the file but never printing its contents', () => {
    const { code, output } = runToExit({ secret: `{"apiUrl": "${SECRET}", oops` });

    assert.notEqual(code, 0);
    assert.match(output, /APP_CONFIG_FILE/);
    assert.ok(!output.includes(SECRET));
  });

  it('refuses to start without any configuration', () => {
    const { code, output } = runToExit();

    assert.notEqual(code, 0);
    assert.match(output, /API_URL/);
  });

  it('does not run as root', () => {
    assert.notEqual(docker('run', '--rm', '--entrypoint', 'id', image, '-u'), '0');
  });
});
