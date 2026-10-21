import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FEEDBACK_LENGTH } from '@feedback/shared';
import { createDb } from './client.ts';
import { feedback, trackVersions } from './schema.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import { createNextVersion, createTrackWithFirstVersion } from './tracks.ts';
import { upsertUserFromAuth } from './users.ts';

// The feedback table's own rules. Its queries come with the API (apps/api/src/modules/feedback).

const db = createDb(testDatabaseUrl('db'));

beforeEach(() => resetDb(db));
afterAll(() => db.close());

const original = {
  filename: 'idea.wav',
  contentType: 'audio/wav',
  sizeBytes: 1000,
};

async function setup() {
  const artist = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
  const listener = await upsertUserFromAuth(db, { authProviderId: 'auth_2', email: 'l@x.test' });
  const { track, version } = await createTrackWithFirstVersion(db, {
    ownerId: artist.id,
    title: 'Idea',
    original,
  });
  const v2 = (await createNextVersion(db, { trackId: track.id, original }))!;
  return { artist, listener, version, v2 };
}

const comment = (
  values: Partial<typeof feedback.$inferInsert> & { trackVersionId: string; authorId: string },
) =>
  db
    .insert(feedback)
    .values({ body: 'Love the bridge', ...values })
    .returning()
    .then(([row]) => row!);

describe('feedback table', () => {
  it('stores a comment with its defaults: open, not deleted', async () => {
    const { listener, version } = await setup();
    const row = await comment({
      trackVersionId: version.id,
      authorId: listener.id,
      timestampMs: 83_000,
    });
    expect(row).toMatchObject({
      parentId: null,
      timestampMs: 83_000,
      status: 'open',
      resolvedAt: null,
      deletedAt: null,
    });
  });

  it('keeps a reply on its parent’s version', async () => {
    const { artist, listener, version, v2 } = await setup();
    const parent = await comment({ trackVersionId: version.id, authorId: listener.id });

    await expect(
      comment({ trackVersionId: version.id, authorId: artist.id, parentId: parent.id }),
    ).resolves.toMatchObject({ parentId: parent.id });
    await expect(
      comment({ trackVersionId: v2.id, authorId: artist.id, parentId: parent.id }),
    ).rejects.toThrow();
  });

  it('gives replies no timestamp and never resolves them', async () => {
    const { artist, listener, version } = await setup();
    const parent = await comment({ trackVersionId: version.id, authorId: listener.id });
    const base = { trackVersionId: version.id, authorId: artist.id, parentId: parent.id };

    await expect(comment({ ...base, timestampMs: 1000 })).rejects.toThrow();
    await expect(
      comment({ ...base, status: 'resolved', resolvedAt: new Date() }),
    ).rejects.toThrow();
  });

  it('pairs a resolved status with when it was resolved', async () => {
    const { listener, version } = await setup();
    const row = await comment({ trackVersionId: version.id, authorId: listener.id });
    const set = (values: Partial<typeof feedback.$inferInsert>) =>
      db.update(feedback).set(values).where(eq(feedback.id, row.id));

    await expect(set({ status: 'resolved' })).rejects.toThrow();
    await expect(set({ resolvedAt: new Date() })).rejects.toThrow();
    await expect(set({ status: 'resolved', resolvedAt: new Date() })).resolves.toBeDefined();
  });

  it('refuses a blank or overlong body and a negative timestamp', async () => {
    const { listener, version } = await setup();
    const base = { trackVersionId: version.id, authorId: listener.id };
    await expect(comment({ ...base, body: '   ' })).rejects.toThrow();
    await expect(comment({ ...base, body: 'x'.repeat(MAX_FEEDBACK_LENGTH + 1) })).rejects.toThrow();
    await expect(
      comment({ ...base, body: 'x'.repeat(MAX_FEEDBACK_LENGTH) }),
    ).resolves.toBeDefined();
    await expect(comment({ ...base, timestampMs: -1 })).rejects.toThrow();
  });

  it('goes with its version, replies included', async () => {
    const { artist, listener, version } = await setup();
    const parent = await comment({ trackVersionId: version.id, authorId: listener.id });
    await comment({ trackVersionId: version.id, authorId: artist.id, parentId: parent.id });

    await db.delete(trackVersions).where(eq(trackVersions.id, version.id));
    expect(await db.select().from(feedback)).toEqual([]);
  });
});
