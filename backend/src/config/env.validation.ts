import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  JWT_SECRET: z.string().min(32),
  GCS_BUCKET: z.string().min(1),
  // Comma-separated list of allowed CORS origins, e.g. "http://localhost:4200,https://dms.example.com".
  FRONTEND_URLS: z
    .string()
    .transform((value) => value.split(',').map((url) => url.trim()))
    .pipe(
      z
        .array(
          z
            .url({ protocol: /^https?$/ })
            // A CORS origin is scheme + host (+ port) only; a path or trailing slash would never match.
            .refine((url) => new URL(url).origin === url, {
              message: 'must be an origin without path or trailing slash',
            }),
        )
        .min(1),
    ),
  // Document worker settings.
  TIKA_URL: z.url({ protocol: /^https?$/ }),
  PROCESSED_BUCKET: z.string().min(1),
  // Audience of the Pub/Sub push token (the backend's own URL).
  BACKEND_URL: z.url({ protocol: /^https?$/ }),
  PUBSUB_PUSH_SA_EMAIL: z.email(),
  // Feature flag for the database connection: remove it two weeks after it is on in use.
  // z.stringbool, not z.coerce.boolean: the latter turns the string "false" into true.
  DATABASE_ENABLED: z.stringbool().default(false),
  // Cloud SQL connection name (project:region:instance). When set, the backend connects through the
  // Cloud SQL connector with IAM login; otherwise it uses DATABASE_URL.
  CLOUD_SQL_INSTANCE: z
    .string()
    .regex(
      /^[^:\s]+:[^:\s]+:[^:\s]+$/,
      'must look like project:region:instance',
    )
    .optional(),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  // Feature flag for login and JWT authentication: remove it two weeks after it is on in use.
  AUTH_ENABLED: z.stringbool().default(false),
  // Feature flag for refresh tokens (SCRUM-16): remove it two weeks after it is on in use.
  REFRESH_ENABLED: z.stringbool().default(false),
  // Feature flag for user management (SCRUM-18): remove it two weeks after it is on in use.
  USERS_ENABLED: z.stringbool().default(false),
});

const envWithRules = envSchema.superRefine((env, ctx) => {
  // Users live in the database, so login cannot work without it.
  if (env.AUTH_ENABLED && !env.DATABASE_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['AUTH_ENABLED'],
      message: 'requires DATABASE_ENABLED to be true',
    });
  }
  // A refresh token is issued at login.
  if (env.REFRESH_ENABLED && !env.AUTH_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['REFRESH_ENABLED'],
      message: 'requires AUTH_ENABLED to be true',
    });
  }
  // Only a logged-in user can manage users.
  if (env.USERS_ENABLED && !env.AUTH_ENABLED) {
    ctx.addIssue({
      code: 'custom',
      path: ['USERS_ENABLED'],
      message: 'requires AUTH_ENABLED to be true',
    });
  }
  if (env.CLOUD_SQL_INSTANCE !== undefined) {
    for (const name of ['DB_NAME', 'DB_USER'] as const) {
      if (env[name] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [name],
          message: 'is required when CLOUD_SQL_INSTANCE is set',
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Validates the environment at startup; throws (aborting boot) if a variable is missing or invalid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envWithRules.safeParse(config);
  if (!result.success) {
    // Only variable names and rules are reported, never the values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables - ${problems}`);
  }
  return result.data;
}
