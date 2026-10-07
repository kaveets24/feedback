import 'server-only';
import { z } from 'zod';

const envSchema = z.object({
  API_URL: z.url(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z
    .string()
    .regex(/^pk_(test|live)_/, 'must be a Clerk publishable key (pk_...)'),
  CLERK_SECRET_KEY: z.string().regex(/^sk_(test|live)_/, 'must be a Clerk secret key (sk_...)'),
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  throw new Error(
    `Invalid environment variables in apps/web/.env.local:\n${z.prettifyError(result.error)}`,
  );
}

export const env = result.data;
