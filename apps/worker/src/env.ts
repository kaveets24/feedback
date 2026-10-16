import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Redis for the job queue (BullMQ). On Fly's private network, add `?family=6` (IPv6). */
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  /** Sentry project DSN; unset turns error reporting off (the default locally). */
  SENTRY_DSN: z.url().optional(),
  /** Tags error reports with where they came from, e.g. `staging`. */
  SENTRY_ENVIRONMENT: z.string().optional(),
  /** Commit the image was built from, baked in by the Dockerfile. Tags error reports. */
  GIT_SHA: z.string().optional(),
  /** Reports one test error at startup, to test error reporting. Off unless testing. */
  MONITORING_TEST_ERRORS: z.stringbool().default(false),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses env vars and throws with a readable message if any are invalid. The STORAGE_* vars are
 * checked separately, by `loadStorageConfig`.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
