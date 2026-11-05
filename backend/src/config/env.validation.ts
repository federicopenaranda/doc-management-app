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
  // Document worker. Feature flag: remove it two weeks after it is on in use.
  // z.stringbool, not z.coerce.boolean: the latter turns the string "false" into true.
  DOCUMENT_PROCESSING_ENABLED: z.stringbool().default(false),
  TIKA_URL: z.url({ protocol: /^https?$/ }).optional(),
  PROCESSED_BUCKET: z.string().min(1).optional(),
  // Audience of the Pub/Sub push token (the backend's own URL).
  BACKEND_URL: z.url({ protocol: /^https?$/ }).optional(),
  PUBSUB_PUSH_SA_EMAIL: z.email().optional(),
});

const WORKER_SETTINGS = [
  'TIKA_URL',
  'PROCESSED_BUCKET',
  'BACKEND_URL',
  'PUBSUB_PUSH_SA_EMAIL',
] as const;

const envWithWorkerRules = envSchema.superRefine((env, ctx) => {
  if (!env.DOCUMENT_PROCESSING_ENABLED) return;
  for (const name of WORKER_SETTINGS) {
    if (env[name] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [name],
        message: 'is required when DOCUMENT_PROCESSING_ENABLED is true',
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Validates the environment at startup; throws (aborting boot) if a variable is missing or invalid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envWithWorkerRules.safeParse(config);
  if (!result.success) {
    // Only variable names and rules are reported, never the values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables - ${problems}`);
  }
  return result.data;
}
