// Dev seed data. Safe to re-run: existing rows (matched by auth id or handle) are left alone.
import { createDb } from '../client.ts';
import { profiles, users, type AccessStatus } from '../schema.ts';
import { databaseUrl } from './env.ts';

const seedUsers: { handle: string; status: AccessStatus }[] = [
  { handle: 'approved_artist', status: 'approved' },
  { handle: 'pending_artist', status: 'pending' },
  { handle: 'rejected_artist', status: 'rejected' },
];

const db = createDb(databaseUrl());
try {
  let created = 0;
  for (const { handle, status } of seedUsers) {
    const [user] = await db
      .insert(users)
      .values({
        authProviderId: `seed|${handle}`,
        email: `${handle}@example.test`,
        accessStatus: status,
        approvedAt: status === 'approved' ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!user) continue;
    created++;
    await db
      .insert(profiles)
      .values({ userId: user.id, handle, displayName: handle.replace('_', ' ') })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${created} new users (${seedUsers.length - created} already present).`);
} finally {
  await db.close();
}
