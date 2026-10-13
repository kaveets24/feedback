import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, 'must be a Clerk secret key (sk_...)'),
  /** Origin of the web app; session tokens from other origins are rejected. */
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  /** Sentry project DSN; unset turns error reporting off (the default locally). */
  SENTRY_DSN: z.url().optional(),
  /** Tags error reports with where they came from, e.g. `staging`. */
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Commit the image was built from, baked in by the Dockerfile. Tags error reports. */
  GIT_SHA: z.string().optional(),
  /** Adds GET /v1/debug/error, which throws, to test error reporting. Off unless testing. */
  MONITORING_TEST_ERRORS: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

/** Parses env vars and throws with a readable message if any are invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
