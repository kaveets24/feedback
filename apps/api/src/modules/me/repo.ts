import { eq } from 'drizzle-orm';
import { profiles, type Db, type Profile } from '@feedback/db';

export async function findProfile(db: Db, userId: string): Promise<Profile | null> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return profile ?? null;
}
