import { eq } from 'drizzle-orm';
import { profiles, type Db, type Profile } from '@feedback/db';

export async function findProfile(db: Db, userId: string): Promise<Profile | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return profile ?? null;
}

export type ProfileChanges = Partial<Pick<Profile, 'handle' | 'displayName' | 'bio' | 'city'>>;

/** Whether `err` is a save refused because someone else already has the handle. */
export function isHandleTaken(err: unknown): boolean {
  // Drizzle wraps the driver's error; postgres.js names the constraint that was broken.
  const cause = err instanceof Error && err.cause ? err.cause : err;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'constraint_name' in cause &&
    cause.constraint_name === 'profiles_handle_unique'
  );
}

/** Applies `changes` to the user's profile, creating it first if they don't have one yet. */
export async function saveProfile(
  db: Db,
  userId: string,
  changes: ProfileChanges,
): Promise<Profile> {
  const [profile] = await db
    .insert(profiles)
    .values({ userId, ...changes })
    // `updatedAt` keeps the set non-empty when nothing else changes.
    .onConflictDoUpdate({ target: profiles.userId, set: { ...changes, updatedAt: new Date() } })
    .returning();
  if (!profile) throw new Error('upsert returned no profile');
  return profile;
}
