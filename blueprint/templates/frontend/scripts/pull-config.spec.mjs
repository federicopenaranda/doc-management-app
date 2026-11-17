import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { parseSecretJson, pullConfig, requireProject, secretName } from './pull-config.mjs';

const SECRET = 'super-secret-value-123';

function messageOf(action) {
  try {
    action();
  } catch (error) {
    return error.message;
  }
  assert.fail('expected the action to throw');
}

describe('parseSecretJson', () => {
  it('returns a flat object of strings, numbers and booleans, any key name', () => {
    assert.deepEqual(
      parseSecretJson('{"apiUrl":"http://localhost:3000","retries":2,"debug":true}'),
      { apiUrl: 'http://localhost:3000', retries: 2, debug: true },
    );
  });

  for (const [label, text] of [
    ['invalid JSON', `{"apiUrl": "${SECRET}", oops`],
    ['an array', `["${SECRET}"]`],
    ['null', 'null'],
    ['a nested object', `{"auth": {"password": "${SECRET}"}}`],
  ]) {
    it(`rejects ${label} without echoing any value`, () => {
      assert.ok(!messageOf(() => parseSecretJson(text)).includes(SECRET));
    });
  }
});

describe('secretName', () => {
  it('is frontend-<env>', () => {
    assert.equal(secretName('sandbox'), 'frontend-sandbox');
    assert.equal(secretName('local'), 'frontend-local');
  });

  it('rejects unknown environments', () => {
    assert.throws(() => secretName('dev'), /local, sandbox, prod/);
  });
});

describe('requireProject', () => {
  it('returns the first value that is set', () => {
    assert.equal(requireProject('from-flag', 'from-env'), 'from-flag');
    assert.equal(requireProject(undefined, 'from-env'), 'from-env');
  });

  it('asks for --project when nothing is set', () => {
    assert.throws(() => requireProject(undefined, undefined), /--project/);
  });
});

describe('pullConfig', () => {
  const fakeClient = (json) => ({
    accessSecretVersion: mock.fn(async () => [{ payload: { data: Buffer.from(json) } }]),
  });

  it('reads the latest version and writes pretty JSON, returning key names only', async () => {
    const client = fakeClient('{"apiUrl":"http://localhost:3000"}');
    const writeFile = mock.fn(async () => {});

    const result = await pullConfig({
      env: 'sandbox',
      project: 'p',
      out: 'public/config.json',
      client,
      writeFile,
    });

    assert.deepEqual(client.accessSecretVersion.mock.calls[0].arguments[0], {
      name: 'projects/p/secrets/frontend-sandbox/versions/latest',
    });
    assert.equal(writeFile.mock.callCount(), 1);
    assert.equal(
      writeFile.mock.calls[0].arguments[1],
      '{\n  "apiUrl": "http://localhost:3000"\n}\n',
    );
    assert.deepEqual(result, { file: 'public/config.json', keys: ['apiUrl'] });
  });

  it('writes nothing when the secret is not a valid flat JSON object', async () => {
    const writeFile = mock.fn(async () => {});

    await assert.rejects(
      pullConfig({
        env: 'local',
        project: 'p',
        out: 'public/config.json',
        client: fakeClient(`["${SECRET}"]`),
        writeFile,
      }),
      /frontend-local/,
    );
    assert.equal(writeFile.mock.callCount(), 0);
  });
});
