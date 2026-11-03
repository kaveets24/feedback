import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAvatar,
  createDb,
  createCover,
  createNextVersion,
  createProject,
  createTrackWithFirstVersion,
  findAvatar,
  findCover,
  findTrack,
  findVersion,
  markVersionFailed,
  markVersionProcessing,
  markVersionReady,
  shareLinks,
  upsertUserFromAuth,
} from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { createStorage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { COVER_FAILURE_REASONS } from '../cover/job.ts';
import { processingAvatar, processingCover, processingVersion, silentLog } from '../testing.ts';
import { FAILURE_REASONS } from '../transcode/job.ts';
import {
  ABANDONED_AFTER_MS,
  CLEANUP_REASONS,
  STUCK_AFTER_MS,
  sweepStuckUploads,
  type JobStates,
  type UploadKind,
} from './sweep.ts';

const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));

let dir: string;
let file: string;
/** Job states the fake queues report, by upload id; anything else is `unknown`. */
let states: Map<string, string>;
let requeued: [UploadKind, string][];
let reports: Record<string, unknown>[];

const jobs: JobStates = {
  state: async (_kind, id) => states.get(id) ?? 'unknown',
  requeue: async (kind, id) => {
    requeued.push([kind, id]);
  },
};

/** A sweep as if it ran `ms` from now. */
const sweepIn = (ms: number) =>
  sweepStuckUploads(
    { db, storage, log: silentLog, jobs, report: (_err, context) => reports.push(context) },
    new Date(Date.now() + ms),
  );

const original = { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 3 };

async function owner() {
  return upsertUserFromAuth(db, { authProviderId: 'auth_owner', email: 'o@x.test' });
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cleanup-test-'));
  file = join(dir, 'bytes.bin');
  await writeFile(file, 'abc');
});
beforeEach(async () => {
  await resetDb(db);
  states = new Map();
  requeued = [];
  reports = [];
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  storage.close();
  await db.close();
});

describe('abandoned uploads', () => {
  it('leaves uploads younger than a day alone', async () => {
    const { version } = await createTrackWithFirstVersion(db, {
      ownerId: (await owner()).id,
      title: 'Idea',
      original,
    });
    const result = await sweepIn(ABANDONED_AFTER_MS - 60_000);
    expect(result.abandoned.versions).toBe(0);
    expect((await findVersion(db, version.id))?.version.status).toBe('uploading');
  });

  it('fails a day-old upload, deletes its file, and deletes the track it was the only try for', async () => {
    const me = await owner();
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId: me.id,
      title: 'Never arrived',
      original,
    });
    // The PUT finished, but "complete" never came.
    await storage.upload(version.originalKey, file, 'audio/wav');
    await db.insert(shareLinks).values({
      resourceType: 'track',
      resourceId: track.id,
      tokenHash: 'a'.repeat(64),
      createdBy: me.id,
    });

    const result = await sweepIn(ABANDONED_AFTER_MS + 60_000);
    expect(result).toMatchObject({ abandoned: { versions: 1 }, deletedTracks: 1 });
    expect(await findTrack(db, track.id)).toBeNull();
    const [link] = await db.select().from(shareLinks);
    expect(link?.revokedAt).not.toBeNull();
    expect(await storage.head(version.originalKey)).toBeNull();

    // A second pass finds nothing left to do.
    expect(await sweepIn(ABANDONED_AFTER_MS + 60_000)).toEqual({
      abandoned: { versions: 0, covers: 0, avatars: 0 },
      deletedTracks: 0,
      requeued: 0,
      failed: 0,
    });
  });

  it('keeps a track that has another version, showing the abandoned one as failed', async () => {
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId: (await owner()).id,
      title: 'Has a v1',
      original,
    });
    await markVersionProcessing(db, version.id);
    await markVersionReady(db, version.id, {
      streamKey: `streams/${version.id}`,
      durationMs: 3000,
      peaks: [0, 1],
    });
    const v2 = await createNextVersion(db, { trackId: track.id, original });

    const result = await sweepIn(ABANDONED_AFTER_MS + 60_000);
    expect(result).toMatchObject({ abandoned: { versions: 1 }, deletedTracks: 0 });
    expect(await findTrack(db, track.id)).not.toBeNull();
    expect((await findVersion(db, v2!.id))?.version).toMatchObject({
      status: 'failed',
      failureReason: CLEANUP_REASONS.abandoned,
    });
  });

  it('keeps a track whose other version failed for another reason', async () => {
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId: (await owner()).id,
      title: 'Bad file, then gave up',
      original,
    });
    await markVersionProcessing(db, version.id);
    await markVersionFailed(db, version.id, FAILURE_REASONS.gaveUp);
    await createNextVersion(db, { trackId: track.id, original });

    expect(await sweepIn(ABANDONED_AFTER_MS + 60_000)).toMatchObject({ deletedTracks: 0 });
    expect(await findTrack(db, track.id)).not.toBeNull();
  });

  it('fails day-old cover and picture uploads and deletes their files', async () => {
    const me = await owner();
    const project = await createProject(db, { ownerId: me.id, title: 'EP' });
    const cover = await createCover(db, {
      projectId: project.id,
      contentType: 'image/png',
      sizeBytes: 3,
    });
    const avatar = await createAvatar(db, {
      userId: me.id,
      contentType: 'image/png',
      sizeBytes: 3,
    });
    await storage.upload(cover.originalKey, file, 'image/png');

    const result = await sweepIn(ABANDONED_AFTER_MS + 60_000);
    expect(result.abandoned).toEqual({ versions: 0, covers: 1, avatars: 1 });
    expect((await findCover(db, cover.id))?.cover).toMatchObject({
      status: 'failed',
      failureReason: CLEANUP_REASONS.abandoned,
    });
    expect(await findAvatar(db, avatar.id)).toMatchObject({ status: 'failed' });
    expect(await storage.head(cover.originalKey)).toBeNull();
  });
});

describe('stuck processing', () => {
  it('leaves uploads processing for under an hour, and any whose job is still going', async () => {
    const recent = await processingVersion(db, storage);
    expect(await sweepIn(STUCK_AFTER_MS - 60_000)).toMatchObject({ requeued: 0, failed: 0 });

    states.set(recent.id, 'active');
    expect(await sweepIn(STUCK_AFTER_MS + 60_000)).toMatchObject({ requeued: 0, failed: 0 });
    states.set(recent.id, 'delayed');
    expect(await sweepIn(STUCK_AFTER_MS + 60_000)).toMatchObject({ requeued: 0, failed: 0 });
    expect((await findVersion(db, recent.id))?.version.status).toBe('processing');
  });

  it('queues a job again when there is none', async () => {
    const version = await processingVersion(db, storage);
    const cover = await processingCover(db, storage);
    const avatar = await processingAvatar(db, storage);

    expect(await sweepIn(STUCK_AFTER_MS + 60_000)).toMatchObject({ requeued: 3, failed: 0 });
    expect(requeued).toEqual([
      ['version', version.id],
      ['cover', cover.id],
      ['avatar', avatar.id],
    ]);
    expect((await findVersion(db, version.id))?.version.status).toBe('processing');
    expect(reports).toEqual([]);
  });

  it('fails and reports uploads whose job failed or completed without them', async () => {
    const version = await processingVersion(db, storage);
    const cover = await processingCover(db, storage);
    states.set(version.id, 'failed');
    states.set(cover.id, 'completed');

    expect(await sweepIn(STUCK_AFTER_MS + 60_000)).toMatchObject({ requeued: 0, failed: 2 });
    expect((await findVersion(db, version.id))?.version).toMatchObject({
      status: 'failed',
      failureReason: FAILURE_REASONS.gaveUp,
    });
    expect((await findCover(db, cover.id))?.cover).toMatchObject({
      status: 'failed',
      failureReason: COVER_FAILURE_REASONS.gaveUp,
    });
    expect(reports).toEqual([
      { kind: 'version', id: version.id, jobState: 'failed' },
      { kind: 'cover', id: cover.id, jobState: 'completed' },
    ]);
  });
});
