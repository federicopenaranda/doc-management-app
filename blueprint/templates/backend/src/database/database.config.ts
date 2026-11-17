import type { Env } from '../config/env.validation.js';

export type DatabaseSettings =
  | { kind: 'url'; connectionString: string }
  | { kind: 'cloud-sql'; instance: string; database: string; user: string };

type DatabaseEnv = Pick<
  Env,
  | 'DATABASE_ENABLED'
  | 'DATABASE_URL'
  | 'CLOUD_SQL_INSTANCE'
  | 'DB_NAME'
  | 'DB_USER'
>;

/** How to reach PostgreSQL, or null while the feature flag is off. */
export function databaseSettings(env: DatabaseEnv): DatabaseSettings | null {
  if (!env.DATABASE_ENABLED) return null;
  // env validation guarantees DB_NAME and DB_USER whenever CLOUD_SQL_INSTANCE is set.
  if (env.CLOUD_SQL_INSTANCE && env.DB_NAME && env.DB_USER) {
    return {
      kind: 'cloud-sql',
      instance: env.CLOUD_SQL_INSTANCE,
      database: env.DB_NAME,
      user: env.DB_USER,
    };
  }
  return { kind: 'url', connectionString: env.DATABASE_URL };
}
