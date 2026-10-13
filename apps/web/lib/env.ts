import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/, 'must be a Clerk publishable key (pk_...)'),
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, 'must be a Clerk secret key (sk_...)'),
  /** Sentry project DSN (also used in the browser); unset turns error reporting off. */
  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  /** Adds /debug/error, which throws, to test error reporting. Off unless testing. */
  MONITORING_TEST_ERRORS: z.stringbool().default(false),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  throw new Error(
    `Invalid environment variables (locally: apps/web/.env.local; see .env.example):\n${z.prettifyError(result.error)}`,
  );
}

export const env = result.data;
