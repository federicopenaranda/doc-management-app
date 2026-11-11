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
import { inlineScriptHashes } from './csp-hashes.mjs';

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
      await fetch(url, { redirect: 'manual' });
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
  it('serves each language copy and falls back to its index.html for client-side routes', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });

    for (const path of ['/es/', '/en/', '/es/some/deep/route', '/en/users/1/edit']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      const html = await response.text();
      assert.match(html, /<dms-root/, path);
      assert.match(html, new RegExp(`<base href="/${path.slice(1, 3)}/"`), path);
    }
  });

  it('sends addresses without a language prefix to the Spanish copy, keeping the route', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });

    for (const [from, to] of [
      ['/', '/es/'],
      ['/users', '/es/users'],
      ['/login?next=1', '/es/login?next=1'],
    ]) {
      const response = await fetch(`${url}${from}`, { redirect: 'manual' });
      assert.equal(response.status, 302, from);
      // Relative on purpose (absolute_redirect off): behind Cloud Run nginx does not know the public host or port.
      assert.equal(response.headers.get('location'), to, from);
    }
  });

  it('translates the Spanish copy and leaves the English one in English', () => {
    // Lazy chunks are not listed in index.html, so look at the files inside the image.
    const has = (language, text) =>
      spawnSync('docker', [
        'run',
        '--rm',
        '--entrypoint',
        'grep',
        image,
        '-rlF',
        text,
        `/usr/share/nginx/html/${language}`,
      ]).status === 0;

    assert.ok(has('es', 'Iniciar sesi'), 'the Spanish copy has the Spanish text');
    assert.ok(!has('en', 'Iniciar sesi'), 'the English copy has none of it');
    assert.ok(has('en', 'Sign in'), 'the English copy keeps the source text');
    assert.ok(!has('es', 'Sign in'), 'the Spanish copy has no English login text');
  });

  it('serves config.json under each language prefix, never cached', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });

    for (const path of ['/config.json', '/es/config.json', '/en/config.json']) {
      const response = await fetch(`${url}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control'), /no-store/, path);
      assert.deepEqual(await response.json(), { apiUrl: 'https://api.example.com' }, path);
    }
  });

  it('sends the security headers on pages, config.json and scripts', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com/v1' } });
    const html = await (await fetch(`${url}/es/`)).text();
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(script, 'the Spanish index.html loads a script');

    for (const path of [
      '/es/',
      '/en/some/route',
      '/config.json',
      '/es/config.json',
      `/es/${script}`,
    ]) {
      const { headers } = await fetch(`${url}${path}`);
      assert.equal(headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(headers.get('x-frame-options'), 'DENY', path);
      assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path);
      assert.match(headers.get('permissions-policy'), /camera=\(\)/, path);
      assert.match(headers.get('strict-transport-security'), /max-age=31536000/, path);
      assert.match(headers.get('content-security-policy'), /frame-ancestors 'none'/, path);
    }
  });

  it('lets the page reach its own API and Google Cloud Storage, and nothing else', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com/v1' } });

    const csp = (await fetch(`${url}/es/`)).headers.get('content-security-policy');

    assert.match(
      csp,
      /connect-src 'self' https:\/\/api\.example\.com https:\/\/storage\.googleapis\.com(;|$)/,
    );
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  });

  it('lets the inline scripts of index.html run, by their hashes', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });
    const response = await fetch(`${url}/es/`);
    const csp = response.headers.get('content-security-policy');
    const hashes = inlineScriptHashes(await response.text());
    assert.ok(hashes.length > 0, 'index.html has inline scripts');

    const scriptSrc = csp.match(/script-src ([^;]*)/)?.[1] ?? '';
    for (const hash of hashes) assert.ok(scriptSrc.includes(hash), `script-src has ${hash}`);
  });

  it('caches the hashed scripts of each copy for a year', async () => {
    const url = await start({ env: { API_URL: 'https://api.example.com' } });
    const html = await (await fetch(`${url}/es/`)).text();
    const script = html.match(/src="([^"]+\.js)"/)?.[1];
    assert.ok(script, 'the Spanish index.html loads a script');

    const response = await fetch(new URL(script, `${url}/es/`));

    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /max-age=31536000/);
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
