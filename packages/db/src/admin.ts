import { parseArgs } from 'node:util';
import { z } from 'zod';
import type { Db } from './client.ts';
import { findUserByEmail, setAccessStatus } from './users.ts';

export const adminUsage = `Usage:
  pnpm admin:approve <email> [--by <admin-email>]
  pnpm admin:reject <email>`;

const commandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('approve'), email: z.email(), by: z.email().optional() }),
  z.strictObject({ command: z.literal('reject'), email: z.email(), by: z.undefined() }),
]);

/**
 * Runs an admin CLI command (`approve <email> [--by <email>]` or `reject <email>`) and returns
 * the message to print. Throws with a readable message on bad input or unknown users.
 */
export async function runAdminCommand(db: Db, argv: string[]): Promise<string> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { by: { type: 'string' } },
  });
  const parsed = commandSchema.safeParse({
    command: positionals[0],
    email: positionals[1],
    by: values.by,
  });
  if (!parsed.success || positionals.length !== 2) throw new Error(adminUsage);
  const input = parsed.data;

  const user = await findUserByEmail(db, input.email);
  if (!user) {
    throw new Error(`No user with email ${input.email}. They need to sign in once first.`);
  }

  let approvedBy: string | null = null;
  if (input.command === 'approve' && input.by) {
    const admin = await findUserByEmail(db, input.by);
    if (!admin) throw new Error(`No user with email ${input.by} (--by).`);
    approvedBy = admin.id;
  }

  const status = input.command === 'approve' ? 'approved' : 'rejected';
  await setAccessStatus(db, { email: input.email, status, approvedBy });
  return `${user.email}: ${user.accessStatus} → ${status}`;
}
