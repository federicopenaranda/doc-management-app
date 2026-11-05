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
});

export type Env = z.infer<typeof envSchema>;

/** Validates the environment at startup; throws (aborting boot) if a variable is missing or invalid. */
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    // Only variable names and rules are reported, never the values (they may be secrets).
    const problems = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment variables - ${problems}`);
  }
  return result.data;
}
