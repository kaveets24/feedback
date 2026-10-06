import { eq } from 'drizzle-orm';
import type { AccessStatus } from '@demo/shared';
import type { Db } from './client.ts';
import { users, type User } from './schema.ts';

export async function findUserByAuthId(db: Db, authProviderId: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.authProviderId, authProviderId));
  return user ?? null;
}

export async function findUserByEmail(db: Db, email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

/**
 * Returns the user for an auth-provider identity, creating it (as `pending`) on first sight
 * and syncing the email if it changed. The common case is a single read.
 */
export async function upsertUserFromAuth(
  db: Db,
  identity: { authProviderId: string; email: string },
): Promise<User> {
  const email = identity.email.toLowerCase();
  const existing = await findUserByAuthId(db, identity.authProviderId);
  if (existing && existing.email === email) return existing;

  const [user] = await db
    .insert(users)
    .values({ authProviderId: identity.authProviderId, email })
    .onConflictDoUpdate({ target: users.authProviderId, set: { email } })
    .returning();
  if (!user) throw new Error('upsert returned no row');
  return user;
}

/**
 * Sets a user's access status by email. Approving records who approved and when; any other
 * status clears both. Returns null if no user has that email.
 */
export async function setAccessStatus(
  db: Db,
  input: { email: string; status: AccessStatus; approvedBy?: string | null },
): Promise<User | null> {
  const approved = input.status === 'approved';
  const [user] = await db
    .update(users)
    .set({
      accessStatus: input.status,
      approvedAt: approved ? new Date() : null,
      approvedBy: approved ? (input.approvedBy ?? null) : null,
    })
    .where(eq(users.email, input.email.toLowerCase()))
    .returning();
  return user ?? null;
}
