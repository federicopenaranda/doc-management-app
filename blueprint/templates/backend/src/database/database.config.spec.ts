import { databaseSettings } from './database.config.js';

const base = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/__DB_NAME__' };
const instance = '__PROJECT_NAME__-sandbox:us-west1:__PROJECT_NAME__-postgres';
const iamUser = 'backend-run@__PROJECT_NAME__-sandbox.iam';

describe('databaseSettings', () => {
  it('is null while the feature flag is off', () => {
    expect(
      databaseSettings({
        ...base,
        DATABASE_ENABLED: false,
        CLOUD_SQL_INSTANCE: instance,
        DB_NAME: '__DB_NAME__',
        DB_USER: iamUser,
      }),
    ).toBeNull();
  });

  it('uses DATABASE_URL when no Cloud SQL instance is set', () => {
    expect(databaseSettings({ ...base, DATABASE_ENABLED: true })).toEqual({
      kind: 'url',
      connectionString: base.DATABASE_URL,
    });
  });

  it('uses the Cloud SQL connector with IAM login when an instance is set', () => {
    expect(
      databaseSettings({
        ...base,
        DATABASE_ENABLED: true,
        CLOUD_SQL_INSTANCE: instance,
        DB_NAME: '__DB_NAME__',
        DB_USER: iamUser,
      }),
    ).toEqual({
      kind: 'cloud-sql',
      instance,
      database: '__DB_NAME__',
      user: iamUser,
    });
  });
});
