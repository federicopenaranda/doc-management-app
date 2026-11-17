import { loadAppConfig } from './load-app-config.js';

const FILE = '/secrets/config.json';
const SECRET = 'super-secret-value-123';

describe('loadAppConfig', () => {
  it('does nothing without APP_CONFIG_FILE', () => {
    const env: NodeJS.ProcessEnv = {};

    loadAppConfig(env, () => {
      throw new Error('must not read any file');
    });

    expect(env).toEqual({});
  });

  it('copies the keys of the JSON file into env', () => {
    const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };

    loadAppConfig(env, () =>
      JSON.stringify({ JWT_SECRET: SECRET, GCS_BUCKET: 'docs' }),
    );

    expect(env.JWT_SECRET).toBe(SECRET);
    expect(env.GCS_BUCKET).toBe('docs');
  });

  it('keeps variables that are already set (plain env wins over the file)', () => {
    const env: NodeJS.ProcessEnv = {
      APP_CONFIG_FILE: FILE,
      FRONTEND_URLS: 'https://from-terraform.example',
    };

    loadAppConfig(env, () =>
      JSON.stringify({ FRONTEND_URLS: 'http://localhost:4200' }),
    );

    expect(env.FRONTEND_URLS).toBe('https://from-terraform.example');
  });

  it('stringifies numbers and booleans', () => {
    const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };

    loadAppConfig(env, () => JSON.stringify({ PORT: 3000, FLAG: true }));

    expect(env.PORT).toBe('3000');
    expect(env.FLAG).toBe('true');
  });

  it('reports an unreadable file by path', () => {
    const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };

    expect(() =>
      loadAppConfig(env, () => {
        throw new Error('ENOENT');
      }),
    ).toThrow(FILE);
  });

  it('points at the line and column of a JSON syntax error, never at its content', () => {
    const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };
    // missing comma after the first value
    const content = `{
  "JWT_SECRET": "${SECRET}"
  "GCS_BUCKET": "docs"
}`;
    const act = () => loadAppConfig(env, () => content);

    expect(act).toThrow(FILE);
    expect(act).toThrow('line 3');
    expect(act).not.toThrow(SECRET);
  });

  it.each([
    ['a lowercase key', 'log_level'],
    ['a key with a trailing space', 'LOG_LEVEL '],
    ['a key containing =', 'A=B'],
    ['an empty key', ''],
  ])(
    'rejects %s, naming the file and the key but never the value',
    (_label, key) => {
      const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };
      const act = () =>
        loadAppConfig(env, () => JSON.stringify({ [key]: SECRET }));

      expect(act).toThrow(FILE);
      expect(act).toThrow(JSON.stringify(key));
      expect(act).not.toThrow(SECRET);
      expect(env).toEqual({ APP_CONFIG_FILE: FILE });
    },
  );

  it.each([
    ['invalid JSON', `{"JWT_SECRET": "${SECRET}", oops`],
    ['an array', `["${SECRET}"]`],
    ['null', 'null'],
    ['a nested object', `{"DATABASE": {"password": "${SECRET}"}}`],
    ['a null value', '{"JWT_SECRET": null}'],
  ])(
    'rejects %s, naming the file and never printing values',
    (_label, content) => {
      const env: NodeJS.ProcessEnv = { APP_CONFIG_FILE: FILE };
      const act = () => loadAppConfig(env, () => content);

      expect(act).toThrow(FILE);
      expect(act).not.toThrow(SECRET);
      expect(env).toEqual({ APP_CONFIG_FILE: FILE });
    },
  );
});
