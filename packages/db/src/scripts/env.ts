import { z } from 'zod';

const scriptEnvSchema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

/** Reads DATABASE_URL for CLI scripts, exiting with a readable message if it's missing. */
export function databaseUrl(): string {
  const result = scriptEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data.DATABASE_URL;
}
