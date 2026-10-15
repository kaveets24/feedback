import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from './client.ts';
import { tracks, trackVersions } from './schema.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import {
  createTrackWithFirstVersion,
  findTrack,
  findVersion,
  markVersionFailed,
  markVersionProcessing,
  markVersionReady,
} from './tracks.ts';
import { upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl('db'));

beforeEach(() => resetDb(db));
afterAll(() => db.close());

const original = { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 1234 };
const output = { streamKey: 'streams/x.m4a', durationMs: 90_000, peaks: [0, 0.5, 1] };

async function newTrack() {
  const owner = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
  return createTrackWithFirstVersion(db, { ownerId: owner.id, title: 'Late Night Idea', original });
}

/** Adds another version directly; the helper for this comes in Phase 3. */
async function addVersion(trackId: string, versionNumber: number) {
  const [version] = await db
    .insert(trackVersions)
    .values({
      trackId,
      versionNumber,
      originalKey: `originals/v${versionNumber}`,
      originalFilename: original.filename,
      originalContentType: original.contentType,
      originalSizeBytes: original.sizeBytes,
    })
    .returning();
  return version!;
}

async function currentVersionId(trackId: string) {
  return (await findTrack(db, trackId))?.currentVersionId;
}

describe('createTrackWithFirstVersion', () => {
  it('creates a private track with v1 uploading, keyed by the version id', async () => {
    const { track, version } = await newTrack();
    expect(track.visibility).toBe('private');
    expect(track.currentVersionId).toBeNull();
    expect(version).toMatchObject({
      trackId: track.id,
      versionNumber: 1,
      status: 'uploading',
      originalKey: `originals/${version.id}`,
      originalFilename: 'idea.wav',
      originalContentType: 'audio/wav',
      originalSizeBytes: 1234,
    });
  });
});

describe('status transitions', () => {
  it('uploading -> processing -> ready', async () => {
    const { version } = await newTrack();
    expect((await markVersionProcessing(db, version.id))?.status).toBe('processing');
    const ready = await markVersionReady(db, version.id, output);
    expect(ready).toMatchObject({
      status: 'ready',
      durationMs: 90_000,
      waveformPeaks: [0, 0.5, 1],
    });
  });

  it('can fail from uploading or processing, with a reason', async () => {
    const a = await newTrack();
    expect(await markVersionFailed(db, a.version.id, 'Upload never finished')).toMatchObject({
      status: 'failed',
      failureReason: 'Upload never finished',
    });

    const b = await createTrackWithFirstVersion(db, {
      ownerId: a.track.ownerId,
      title: 'Second',
      original,
    });
    await markVersionProcessing(db, b.version.id);
    expect((await markVersionFailed(db, b.version.id, 'Not audio'))?.status).toBe('failed');
  });

  it('rejects transitions the state machine does not allow', async () => {
    const { version } = await newTrack();
    expect(await markVersionReady(db, version.id, output)).toBeNull(); // still uploading

    await markVersionProcessing(db, version.id);
    expect(await markVersionProcessing(db, version.id)).toBeNull(); // completing twice

    await markVersionReady(db, version.id, output);
    expect(await markVersionReady(db, version.id, output)).toBeNull(); // ready is immutable
    expect(await markVersionFailed(db, version.id, 'late')).toBeNull();
    expect((await findVersion(db, version.id))?.version.status).toBe('ready');
  });

  it('keeps failed terminal', async () => {
    const { version } = await newTrack();
    await markVersionFailed(db, version.id, 'nope');
    expect(await markVersionProcessing(db, version.id)).toBeNull();
    expect(await markVersionFailed(db, version.id, 'again')).toBeNull();
  });

  it('returns null for an unknown version', async () => {
    const id = '01900000-0000-7000-8000-000000000000';
    expect(await markVersionProcessing(db, id)).toBeNull();
    expect(await findVersion(db, id)).toBeNull();
  });
});

describe('current version', () => {
  it('moves only when a version becomes ready, and never back to an older one', async () => {
    const { track, version: v1 } = await newTrack();
    const v2 = await addVersion(track.id, 2);

    await markVersionProcessing(db, v1.id);
    await markVersionProcessing(db, v2.id);
    expect(await currentVersionId(track.id)).toBeNull();

    await markVersionReady(db, v2.id, output);
    expect(await currentVersionId(track.id)).toBe(v2.id);

    // v1 finishing late doesn't replace the newer v2.
    await markVersionReady(db, v1.id, output);
    expect(await currentVersionId(track.id)).toBe(v2.id);

    // A failed v3 leaves v2 current.
    const v3 = await addVersion(track.id, 3);
    await markVersionFailed(db, v3.id, 'Corrupt file');
    expect(await currentVersionId(track.id)).toBe(v2.id);
  });
});

describe('database constraints', () => {
  it('rejects a duplicate version number for the same track', async () => {
    const { track } = await newTrack();
    await expect(addVersion(track.id, 1)).rejects.toThrow();
  });

  it('rejects ready without outputs and failed without a reason', async () => {
    const { version } = await newTrack();
    await expect(
      db.update(trackVersions).set({ status: 'ready' }).where(eq(trackVersions.id, version.id)),
    ).rejects.toThrow();
    await expect(
      db.update(trackVersions).set({ status: 'failed' }).where(eq(trackVersions.id, version.id)),
    ).rejects.toThrow();
  });
});

describe('find helpers', () => {
  it('skip deleted tracks and their versions', async () => {
    const { track, version } = await newTrack();
    expect((await findVersion(db, version.id))?.track.id).toBe(track.id);

    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, track.id));
    expect(await findTrack(db, track.id)).toBeNull();
    expect(await findVersion(db, version.id)).toBeNull();
  });
});
