import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/__DB_NAME__',
  JWT_SECRET: 'x'.repeat(32),
  GCS_BUCKET: '__PROJECT_NAME__-documents',
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
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each(['DATABASE_URL', 'JWT_SECRET', 'GCS_BUCKET', 'FRONTEND_URLS'])(
    'throws naming %s when it is missing',
    (name) => {
      const env: Record<string, string> = { ...valid };
      delete env[name];

      expect(() => validateEnv(env)).toThrow(name);
    },
  );

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
