import { validateEnv } from './env.validation.js';

const worker = {
  TIKA_URL: 'https://tika.example.com',
  PROCESSED_BUCKET: 'dms-documents-processed',
  BACKEND_URL: 'https://backend.example.com',
  PUBSUB_PUSH_SA_EMAIL: 'pubsub-push@project.iam.gserviceaccount.com',
};

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/dms',
  JWT_SECRET: 'x'.repeat(32),
  GCS_BUCKET: 'dms-documents',
  FRONTEND_URLS: 'http://localhost:4200, https://dms.example.com',
  ...worker,
};

describe('validateEnv', () => {
  it('returns typed values and applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      FRONTEND_URLS: ['http://localhost:4200', 'https://dms.example.com'],
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      PORT: 3000,
      DATABASE_ENABLED: false,
      AUTH_ENABLED: false,
      REFRESH_ENABLED: false,
      USERS_ENABLED: false,
    });
  });

  it('coerces PORT to a number', () => {
    expect(validateEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'GCS_BUCKET',
    'FRONTEND_URLS',
    ...Object.keys(worker),
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

  it('rejects a TIKA_URL that is not a URL', () => {
    expect(() => validateEnv({ ...valid, TIKA_URL: 'tika' })).toThrow(
      'TIKA_URL',
    );
  });
});

describe('validateEnv: database', () => {
  const instance = 'doc-management-sandbox:us-west1:dms-postgres';
  const cloudSql = {
    ...valid,
    DATABASE_ENABLED: 'true',
    CLOUD_SQL_INSTANCE: instance,
    DB_NAME: 'dms',
    DB_USER: 'backend-run@doc-management-sandbox.iam',
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

  it.each(['dms-postgres', 'a:b', 'a:b:c:d'])(
    'rejects the malformed instance name %s',
    (bad) => {
      expect(() => validateEnv({ ...valid, CLOUD_SQL_INSTANCE: bad })).toThrow(
        'CLOUD_SQL_INSTANCE',
      );
    },
  );
});

describe('validateEnv: auth', () => {
  it('is off by default', () => {
    expect(validateEnv(valid).AUTH_ENABLED).toBe(false);
  });

  it('needs the database feature, because users live in the database', () => {
    expect(() => validateEnv({ ...valid, AUTH_ENABLED: 'true' })).toThrow(
      'AUTH_ENABLED',
    );
  });

  it('is accepted together with the database feature', () => {
    const env = validateEnv({
      ...valid,
      AUTH_ENABLED: 'true',
      DATABASE_ENABLED: 'true',
    });

    expect(env.AUTH_ENABLED).toBe(true);
  });
});

describe('validateEnv: refresh tokens', () => {
  const withAuth = {
    ...valid,
    AUTH_ENABLED: 'true',
    DATABASE_ENABLED: 'true',
  };

  it('is off by default', () => {
    expect(validateEnv(withAuth).REFRESH_ENABLED).toBe(false);
  });

  it('needs login, because a refresh token is issued at login', () => {
    expect(() => validateEnv({ ...valid, REFRESH_ENABLED: 'true' })).toThrow(
      'REFRESH_ENABLED',
    );
  });

  it('is accepted together with login', () => {
    expect(
      validateEnv({ ...withAuth, REFRESH_ENABLED: 'true' }).REFRESH_ENABLED,
    ).toBe(true);
  });
});

describe('validateEnv: users', () => {
  it('is off by default', () => {
    expect(validateEnv(valid).USERS_ENABLED).toBe(false);
  });

  it('needs login, because only a logged-in user can manage users', () => {
    expect(() => validateEnv({ ...valid, USERS_ENABLED: 'true' })).toThrow(
      'USERS_ENABLED',
    );
  });

  it('is accepted together with login', () => {
    const env = validateEnv({
      ...valid,
      AUTH_ENABLED: 'true',
      DATABASE_ENABLED: 'true',
      USERS_ENABLED: 'true',
    });

    expect(env.USERS_ENABLED).toBe(true);
  });
});
