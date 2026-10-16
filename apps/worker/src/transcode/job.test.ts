import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDb,
  createTrackWithFirstVersion,
  findVersion,
  upsertUserFromAuth,
} from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { WAVEFORM_PEAK_COUNT } from '@feedback/shared';
import { createStorage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { makeFixture, makeGarbage, probeFile, processingVersion, silentLog } from '../testing.ts';
import { UNUSABLE_REASONS } from './ffmpeg.ts';
import { FAILURE_REASONS, streamKey, transcodeVersion } from './job.ts';

const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));
const deps = { db, storage, log: silentLog };

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'job-test-'));
});
beforeEach(() => resetDb(db));
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  storage.close();
  await db.close();
});

const reload = async (versionId: string) => (await findVersion(db, versionId))!;

describe('transcodeVersion', () => {
  it('stores the stream and marks the version ready as the track’s current version', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.mp3'));

    expect(await transcodeVersion(deps, version.id)).toBe('ready');

    const { track, version: ready } = await reload(version.id);
    expect(ready).toMatchObject({ status: 'ready', streamKey: streamKey(version.id) });
    expect(Math.abs(ready.durationMs! - 3000)).toBeLessThan(60);
    expect(ready.waveformPeaks).toHaveLength(WAVEFORM_PEAK_COUNT);
    expect(track.currentVersionId).toBe(version.id);

    expect(await storage.head(streamKey(version.id))).toMatchObject({ contentType: 'audio/mp4' });
    const local = join(dir, 'downloaded.m4a');
    await storage.download(streamKey(version.id), local);
    expect((await probeFile(local)).streams.map((s) => s.codec_name)).toEqual(['aac']);
  });

  it('does nothing when run again for a ready version', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.wav'));
    await transcodeVersion(deps, version.id);
    const before = (await reload(version.id)).version;

    expect(await transcodeVersion(deps, version.id)).toBe('skipped');
    expect((await reload(version.id)).version).toEqual(before);
  });

  it('skips a version still uploading, and one that is gone', async () => {
    const owner = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    const { version } = await createTrackWithFirstVersion(db, {
      ownerId: owner.id,
      title: 'Not uploaded yet',
      original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 1 },
    });
    expect(await transcodeVersion(deps, version.id)).toBe('skipped');
    expect((await reload(version.id)).version.status).toBe('uploading');

    expect(await transcodeVersion(deps, crypto.randomUUID())).toBe('skipped');
  });

  it('marks the version failed, without throwing, when the file is unusable', async () => {
    const version = await processingVersion(db, storage, await makeGarbage(dir));

    expect(await transcodeVersion(deps, version.id)).toBe('failed');

    const { track, version: failed } = await reload(version.id);
    expect(failed).toMatchObject({
      status: 'failed',
      failureReason: UNUSABLE_REASONS.unreadable,
      streamKey: null,
    });
    expect(track.currentVersionId).toBeNull();
    expect(await storage.head(streamKey(version.id))).toBeNull();
  });

  it('marks the version failed when the original is missing', async () => {
    const version = await processingVersion(db, storage);
    expect(await transcodeVersion(deps, version.id)).toBe('failed');
    expect((await reload(version.id)).version.failureReason).toBe(FAILURE_REASONS.missingOriginal);
  });

  it('applies the duration limit it is given', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.wav'));
    const limited = { ...deps, ffmpeg: { maxDurationMs: 1000 } };
    expect(await transcodeVersion(limited, version.id)).toBe('failed');
    expect((await reload(version.id)).version.failureReason).toBe(UNUSABLE_REASONS.tooLong);
  });

  it('throws, leaving the version processing, when storage fails', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.wav'));
    const broken = createStorage(testStorageConfig('no-such-bucket'));
    try {
      await expect(transcodeVersion({ ...deps, storage: broken }, version.id)).rejects.toThrow();
    } finally {
      broken.close();
    }
    expect((await reload(version.id)).version.status).toBe('processing');
  });
});
