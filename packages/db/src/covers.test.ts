import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from './client.ts';
import {
  coverKeys,
  createCover,
  findCover,
  latestCover,
  markCoverFailed,
  markCoverProcessing,
  markCoverReady,
  removeProjectCover,
} from './covers.ts';
import { createProject, deleteProject, findProject } from './projects.ts';
import { projectCovers } from './schema.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import { upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl('db'));

beforeEach(() => resetDb(db));
afterAll(() => db.close());

async function newProject() {
  const owner = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'u1@x.test' });
  return createProject(db, { ownerId: owner.id, title: 'EP' });
}

const upload = (projectId: string) =>
  createCover(db, { projectId, contentType: 'image/jpeg', sizeBytes: 1234 });

/** A cover moved all the way to `ready`. */
async function readyCover(projectId: string) {
  const cover = await upload(projectId);
  await markCoverProcessing(db, cover.id);
  return (await markCoverReady(db, cover.id, `covers/${cover.id}.jpg`))!;
}

describe('createCover', () => {
  it('starts an upload with its original key derived from the cover id', async () => {
    const project = await newProject();
    const cover = await upload(project.id);
    expect(cover).toMatchObject({
      projectId: project.id,
      status: 'uploading',
      originalKey: `cover-originals/${cover.id}`,
      originalContentType: 'image/jpeg',
      originalSizeBytes: 1234,
      coverKey: null,
    });
  });
});

describe('cover status', () => {
  it('moves uploading -> processing -> ready, and repeats change nothing', async () => {
    const project = await newProject();
    const cover = await upload(project.id);

    expect(await markCoverReady(db, cover.id, 'covers/x.jpg')).toBeNull();
    expect(await markCoverProcessing(db, cover.id)).toMatchObject({ status: 'processing' });
    expect(await markCoverProcessing(db, cover.id)).toBeNull();
    expect(await markCoverReady(db, cover.id, 'covers/x.jpg')).toMatchObject({
      status: 'ready',
      coverKey: 'covers/x.jpg',
    });
    expect(await markCoverFailed(db, cover.id, 'Bad image')).toBeNull();
  });

  it('fails from uploading or processing, with the reason', async () => {
    const project = await newProject();
    const a = await upload(project.id);
    const b = await upload(project.id);
    await markCoverProcessing(db, b.id);

    expect(await markCoverFailed(db, a.id, 'Not an image')).toMatchObject({
      status: 'failed',
      failureReason: 'Not an image',
    });
    expect(await markCoverFailed(db, b.id, 'Too big')).toMatchObject({ status: 'failed' });
    expect((await findProject(db, project.id))?.currentCoverId).toBeNull();
  });
});

describe('markCoverReady', () => {
  it('makes the cover current, unless a newer one already is', async () => {
    const project = await newProject();
    const older = await upload(project.id);
    const newer = await readyCover(project.id);
    expect((await findProject(db, project.id))?.currentCoverId).toBe(newer.id);

    // The older upload finishing late doesn't replace the newer cover.
    await markCoverProcessing(db, older.id);
    await markCoverReady(db, older.id, 'covers/older.jpg');
    expect((await findProject(db, project.id))?.currentCoverId).toBe(newer.id);
  });
});

describe('findCover', () => {
  it('returns the cover with its project, or null once the project is deleted', async () => {
    const project = await newProject();
    const cover = await upload(project.id);
    expect(await findCover(db, cover.id)).toMatchObject({
      cover: { id: cover.id },
      project: { id: project.id },
    });

    await deleteProject(db, project.id);
    expect(await findCover(db, cover.id)).toBeNull();
    expect(await findCover(db, crypto.randomUUID())).toBeNull();
  });
});

describe('latestCover and coverKeys', () => {
  it('finds the newest upload, and the stored keys of ready covers only', async () => {
    const project = await newProject();
    expect(await latestCover(db, project.id)).toBeNull();
    const ready = await readyCover(project.id);
    const pending = await upload(project.id);

    expect((await latestCover(db, project.id))?.id).toBe(pending.id);
    const keys = await coverKeys(db, [ready.id, pending.id]);
    expect([...keys]).toEqual([[ready.id, `covers/${ready.id}.jpg`]]);
    expect(await coverKeys(db, [])).toEqual(new Map());
  });
});

describe('removeProjectCover', () => {
  it('clears the current cover and keeps the uploads; null for a deleted project', async () => {
    const project = await newProject();
    const cover = await readyCover(project.id);

    expect((await removeProjectCover(db, project.id))?.currentCoverId).toBeNull();
    expect(
      await db.select().from(projectCovers).where(eq(projectCovers.id, cover.id)),
    ).toHaveLength(1);

    await deleteProject(db, project.id);
    expect(await removeProjectCover(db, project.id)).toBeNull();
  });

  it('a deleted cover row clears the project pointer (on delete set null)', async () => {
    const project = await newProject();
    const cover = await readyCover(project.id);
    await db.delete(projectCovers).where(eq(projectCovers.id, cover.id));
    expect((await findProject(db, project.id))?.currentCoverId).toBeNull();
  });
});

describe('database constraints', () => {
  it('requires a stored key when ready and a reason when failed', async () => {
    const project = await newProject();
    const cover = await upload(project.id);
    await expect(
      db.update(projectCovers).set({ status: 'ready' }).where(eq(projectCovers.id, cover.id)),
    ).rejects.toThrow();
    await expect(
      db.update(projectCovers).set({ status: 'failed' }).where(eq(projectCovers.id, cover.id)),
    ).rejects.toThrow();
  });
});
