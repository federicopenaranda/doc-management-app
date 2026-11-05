import { validateEnv } from './env.validation.js';

const valid = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/dms',
  JWT_SECRET: 'x'.repeat(32),
  GCS_BUCKET: 'dms-documents',
  FRONTEND_URLS: 'http://localhost:4200, https://dms.example.com',
};

describe('validateEnv', () => {
  it('returns typed values and applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      FRONTEND_URLS: ['http://localhost:4200', 'https://dms.example.com'],
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      PORT: 3000,
      DOCUMENT_PROCESSING_ENABLED: false,
      UPLOADS_ENABLED: false,
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

  describe('document worker settings', () => {
    const worker = {
      TIKA_URL: 'https://tika.example.com',
      PROCESSED_BUCKET: 'dms-documents-processed',
      BACKEND_URL: 'https://backend.example.com',
      PUBSUB_PUSH_SA_EMAIL: 'pubsub-push@project.iam.gserviceaccount.com',
    };

    it('is off by default and needs none of the settings', () => {
      expect(validateEnv(valid).DOCUMENT_PROCESSING_ENABLED).toBe(false);
    });

    it.each([
      ['true', true],
      ['false', false],
    ])('reads the flag string "%s" as %s', (raw, expected) => {
      const env = validateEnv({
        ...valid,
        ...worker,
        DOCUMENT_PROCESSING_ENABLED: raw,
      });

      expect(env.DOCUMENT_PROCESSING_ENABLED).toBe(expected);
    });

    it.each(Object.keys(worker))(
      'throws naming %s when the flag is on and it is missing',
      (name) => {
        const env: Record<string, string> = {
          ...valid,
          ...worker,
          DOCUMENT_PROCESSING_ENABLED: 'true',
        };
        delete env[name];

        expect(() => validateEnv(env)).toThrow(name);
      },
    );

    it('rejects a TIKA_URL that is not a URL', () => {
      expect(() =>
        validateEnv({ ...valid, ...worker, TIKA_URL: 'tika' }),
      ).toThrow('TIKA_URL');
    });
  });

  describe('uploads flag', () => {
    it.each([
      [undefined, false],
      ['true', true],
      ['false', false],
    ])('reads UPLOADS_ENABLED=%s as %s', (raw, expected) => {
      const env = validateEnv({ ...valid, UPLOADS_ENABLED: raw });

      expect(env.UPLOADS_ENABLED).toBe(expected);
    });
  });
});
