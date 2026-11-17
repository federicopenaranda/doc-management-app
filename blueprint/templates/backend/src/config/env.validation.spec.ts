import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/__DB_NAME__',
  JWT_SECRET: 'x'.repeat(32),
  FRONTEND_URLS: 'http://localhost:4200, https://__PROJECT_NAME__.example.com',
};

describe('validateEnv', () => {
  it('returns typed values and applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      FRONTEND_URLS: ['http://localhost:4200', 'https://__PROJECT_NAME__.example.com'],
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      PORT: 3000,
      DATABASE_ENABLED: false,
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'FRONTEND_URLS',
  ])('throws naming %s when it is missing', (name) => {
    const env: Record<string, string> = { ...valid };
    delete env[name];

    expect(() => validateEnv(env)).toThrow(name);
  });

  it('rejects a JWT_SECRET shorter than 32 characters', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET',
    );
  });

  it('rejects a DATABASE_URL that is not a postgres URL', () => {
    expect(() =>
      validateEnv({ ...valid, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow('DATABASE_URL');
  });

  it('rejects a FRONTEND_URLS entry that is not a URL', () => {
    expect(() =>
      validateEnv({ ...valid, FRONTEND_URLS: 'localhost:4200' }),
    ).toThrow('FRONTEND_URLS');
  });

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => validateEnv({ ...valid, LOG_LEVEL: 'loud' })).toThrow(
      'LOG_LEVEL',
    );
  });

  it('never echoes secret values in the error message', () => {
    expect(() =>
      validateEnv({ ...valid, JWT_SECRET: 'short-secret' }),
    ).not.toThrow(/short-secret/);
  });
});

describe('validateEnv: database', () => {
  const instance = '__PROJECT_NAME__-sandbox:us-west1:__PROJECT_NAME__-postgres';
  const cloudSql = {
    ...valid,
    DATABASE_ENABLED: 'true',
    CLOUD_SQL_INSTANCE: instance,
    DB_NAME: '__DB_NAME__',
    DB_USER: 'backend-run@__PROJECT_NAME__-sandbox.iam',
  };

  it('is off by default and needs no Cloud SQL settings', () => {
    const env = validateEnv(valid);

    expect(env.DATABASE_ENABLED).toBe(false);
    expect(env.CLOUD_SQL_INSTANCE).toBeUndefined();
  });

  it('accepts a Cloud SQL instance with its database and user', () => {
    const env = validateEnv(cloudSql);

    expect(env.DATABASE_ENABLED).toBe(true);
    expect(env.CLOUD_SQL_INSTANCE).toBe(instance);
  });

  it.each(['DB_NAME', 'DB_USER'])(
    'requires %s when a Cloud SQL instance is set',
    (name) => {
      const env: Record<string, string> = { ...cloudSql };
      delete env[name];

      expect(() => validateEnv(env)).toThrow(name);
    },
  );

  it.each(['__PROJECT_NAME__-postgres', 'a:b', 'a:b:c:d'])(
    'rejects the malformed instance name %s',
    (bad) => {
      expect(() => validateEnv({ ...valid, CLOUD_SQL_INSTANCE: bad })).toThrow(
        'CLOUD_SQL_INSTANCE',
      );
    },
  );
});
