import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDb, currentAvatar, findAvatar, findCover, findProject } from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { createStorage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { probeFile, processingAvatar, processingCover, silentLog } from '../testing.ts';
import { UNUSABLE_IMAGE_REASONS } from './ffmpeg.ts';
import { avatarKey, COVER_FAILURE_REASONS, coverKey, processAvatar, processCover } from './job.ts';

const exec = promisify(execFile);
const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));
const deps = { db, storage, log: silentLog };

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cover-job-'));
});
beforeEach(() => resetDb(db));
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  storage.close();
  await db.close();
});

async function png(name: string, size = '1600x900') {
  const path = join(dir, name);
  await exec('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=teal:s=${size}`,
    '-frames:v',
    '1',
    path,
  ]);
  return path;
}

const reload = async (coverId: string) => (await findCover(db, coverId))!;

describe('processCover', () => {
  it('stores a square JPEG, makes it the project cover, and deletes the original', async () => {
    const cover = await processingCover(db, storage, await png('wide.png'));

    expect(await processCover(deps, cover.id)).toBe('ready');

    const { cover: ready, project } = await reload(cover.id);
    expect(ready).toMatchObject({ status: 'ready', coverKey: coverKey(cover.id) });
    expect(project.currentCoverId).toBe(cover.id);
    expect(await storage.head(coverKey(cover.id))).toMatchObject({ contentType: 'image/jpeg' });
    expect(await storage.head(cover.originalKey)).toBeNull();

    const local = join(dir, 'downloaded.jpg');
    await storage.download(coverKey(cover.id), local);
    const probed = (await probeFile(local)) as unknown as {
      streams: { codec_name: string; width: number; height: number }[];
    };
    expect(probed.streams[0]).toMatchObject({ codec_name: 'mjpeg', width: 900, height: 900 });
  });

  it('does nothing when run again, or for a cover that is not processing', async () => {
    const cover = await processingCover(db, storage, await png('again.png', '64x64'));
    await processCover(deps, cover.id);
    const before = (await reload(cover.id)).cover;

    expect(await processCover(deps, cover.id)).toBe('skipped');
    expect((await reload(cover.id)).cover).toEqual(before);
    expect(await processCover(deps, crypto.randomUUID())).toBe('skipped');
  });

  it('marks an unusable image failed, without throwing, and deletes the original', async () => {
    const path = join(dir, 'noise.png');
    await writeFile(path, crypto.getRandomValues(new Uint8Array(2048)));
    const cover = await processingCover(db, storage, path);

    expect(await processCover(deps, cover.id)).toBe('failed');
    expect((await reload(cover.id)).cover).toMatchObject({
      status: 'failed',
      failureReason: UNUSABLE_IMAGE_REASONS.unreadable,
    });
    expect(await storage.head(cover.originalKey)).toBeNull();
    expect((await findProject(db, (await reload(cover.id)).project.id))?.currentCoverId).toBeNull();
  });

  it('marks the cover failed when the original is missing', async () => {
    const cover = await processingCover(db, storage);
    expect(await processCover(deps, cover.id)).toBe('failed');
    expect((await reload(cover.id)).cover.failureReason).toBe(
      COVER_FAILURE_REASONS.missingOriginal,
    );
  });

  it('throws, leaving the cover processing, when storage fails', async () => {
    const cover = await processingCover(db, storage, await png('flaky.png', '64x64'));
    const failing = { ...storage, upload: vi.fn().mockRejectedValue(new Error('storage down')) };

    await expect(processCover({ ...deps, storage: failing }, cover.id)).rejects.toThrow(
      'storage down',
    );
    expect((await reload(cover.id)).cover.status).toBe('processing');
    // The original stays, so the retry has something to work from.
    expect(await storage.head(cover.originalKey)).not.toBeNull();
  });
});

describe('processAvatar', () => {
  it('stores a square JPEG of at most 512px, makes it the picture, and deletes the original', async () => {
    const avatar = await processingAvatar(db, storage, await png('portrait.png', '800x1200'));

    expect(await processAvatar(deps, avatar.id)).toBe('ready');

    expect(await findAvatar(db, avatar.id)).toMatchObject({
      status: 'ready',
      imageKey: avatarKey(avatar.id),
    });
    expect((await currentAvatar(db, avatar.userId))?.id).toBe(avatar.id);
    expect(await storage.head(avatar.originalKey)).toBeNull();

    const local = join(dir, 'avatar.jpg');
    await storage.download(avatarKey(avatar.id), local);
    const probed = (await probeFile(local)) as unknown as {
      streams: { codec_name: string; width: number; height: number }[];
    };
    expect(probed.streams[0]).toMatchObject({ codec_name: 'mjpeg', width: 512, height: 512 });
  });

  it('marks an unusable picture failed and deletes the original', async () => {
    const path = join(dir, 'noise-avatar.png');
    await writeFile(path, crypto.getRandomValues(new Uint8Array(2048)));
    const avatar = await processingAvatar(db, storage, path);

    expect(await processAvatar(deps, avatar.id)).toBe('failed');
    expect(await findAvatar(db, avatar.id)).toMatchObject({
      status: 'failed',
      failureReason: UNUSABLE_IMAGE_REASONS.unreadable,
    });
    expect(await storage.head(avatar.originalKey)).toBeNull();
  });
});
