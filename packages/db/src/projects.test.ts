import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb } from './client.ts';
import {
  createProject,
  deleteProject,
  findProject,
  findProjectsByIds,
  listProjectsForOwner,
  listProjectTracks,
  moveTrackToProject,
  reorderProjectTracks,
  setTrackVisibility,
  updateProject,
} from './projects.ts';
import { projects, shareLinks, tracks, users } from './schema.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import {
  createNextVersion,
  createTrackWithFirstVersion,
  findTrack,
  listVersions,
  markVersionProcessing,
  markVersionReady,
  withCurrentVersions,
} from './tracks.ts';
import { upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl('db'));

beforeEach(() => resetDb(db));
afterAll(() => db.close());

const original = { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 1234 };

function newUser(n = 1) {
  return upsertUserFromAuth(db, { authProviderId: `auth_${n}`, email: `u${n}@x.test` });
}

async function newTrack(ownerId: string, title = 'Late Night Idea') {
  return (await createTrackWithFirstVersion(db, { ownerId, title, original })).track;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

/** A share link row, straight into the table (the API's helpers come later). */
async function newLink(
  createdBy: string,
  resourceType: 'project' | 'track',
  resourceId: string,
  overrides: Partial<typeof shareLinks.$inferInsert> = {},
) {
  const [link] = await db
    .insert(shareLinks)
    .values({
      resourceType,
      resourceId,
      tokenHash: randomBytes(32).toString('hex'),
      createdBy,
      ...overrides,
    })
    .returning();
  return link!;
}

async function findLink(id: string) {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, id));
  return link!;
}

describe('createProject', () => {
  it('creates a private single', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'Summer EP' });
    expect(project).toMatchObject({
      ownerId: owner.id,
      title: 'Summer EP',
      description: null,
      releaseType: 'single',
      visibility: 'private',
      deletedAt: null,
    });
  });
});

describe('listProjectsForOwner', () => {
  it("lists only the owner's live projects, newest first, and pages by id", async () => {
    const owner = await newUser(1);
    const other = await newUser(2);
    const a = await createProject(db, { ownerId: owner.id, title: 'A' });
    const b = await createProject(db, { ownerId: owner.id, title: 'B' });
    const c = await createProject(db, { ownerId: owner.id, title: 'C' });
    await createProject(db, { ownerId: other.id, title: 'Not mine' });
    await deleteProject(db, b.id);

    expect(ids(await listProjectsForOwner(db, owner.id, { limit: 10 }))).toEqual([c.id, a.id]);
    expect(ids(await listProjectsForOwner(db, owner.id, { limit: 1 }))).toEqual([c.id]);
    expect(ids(await listProjectsForOwner(db, owner.id, { limit: 1, before: c.id }))).toEqual([
      a.id,
    ]);
  });
});

describe('updateProject', () => {
  it('applies changes to a live project', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'Draft' });
    const updated = await updateProject(db, project.id, {
      title: 'Summer EP',
      description: 'Five songs',
      releaseType: 'ep',
    });
    expect(updated).toMatchObject({
      title: 'Summer EP',
      description: 'Five songs',
      releaseType: 'ep',
    });
    expect(await updateProject(db, project.id, {})).toMatchObject({ title: 'Summer EP' });
  });

  it('returns null for a deleted or unknown project', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'Gone' });
    await deleteProject(db, project.id);
    expect(await updateProject(db, project.id, { title: 'Back?' })).toBeNull();
    expect(await updateProject(db, '01900000-0000-7000-8000-000000000000', {})).toBeNull();
  });
});

describe('moveTrackToProject', () => {
  it('appends tracks in the order they join', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const t1 = await newTrack(owner.id, 'One');
    const t2 = await newTrack(owner.id, 'Two');
    const t3 = await newTrack(owner.id, 'Three');
    for (const t of [t2, t1, t3]) await moveTrackToProject(db, t.id, project.id);

    const listed = await listProjectTracks(db, project.id);
    expect(ids(listed)).toEqual([t2.id, t1.id, t3.id]);
    expect(listed.map((t) => t.position)).toEqual([0, 1, 2]);
  });

  it('leaves a track where it is when moved into its own project', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const t1 = await newTrack(owner.id);
    const t2 = await newTrack(owner.id);
    await moveTrackToProject(db, t1.id, project.id);
    await moveTrackToProject(db, t2.id, project.id);
    expect(await moveTrackToProject(db, t1.id, project.id)).toMatchObject({ position: 0 });
  });

  it('moves between projects and back out, clearing the visibility override', async () => {
    const owner = await newUser();
    const a = await createProject(db, { ownerId: owner.id, title: 'A' });
    const b = await createProject(db, { ownerId: owner.id, title: 'B' });
    const track = await newTrack(owner.id);
    await moveTrackToProject(db, (await newTrack(owner.id)).id, b.id);
    await moveTrackToProject(db, track.id, a.id);
    await db.update(tracks).set({ visibilityOverride: 'private' }).where(eq(tracks.id, track.id));

    expect(await moveTrackToProject(db, track.id, b.id)).toMatchObject({
      projectId: b.id,
      position: 1,
      visibilityOverride: null,
    });
    expect(await listProjectTracks(db, a.id)).toEqual([]);
    expect(await moveTrackToProject(db, track.id, null)).toMatchObject({
      projectId: null,
      position: null,
    });
  });

  it("returns null for a deleted project or track, or another owner's project", async () => {
    const owner = await newUser(1);
    const other = await newUser(2);
    const track = await newTrack(owner.id);
    const deleted = await createProject(db, { ownerId: owner.id, title: 'Gone' });
    await deleteProject(db, deleted.id);
    const theirs = await createProject(db, { ownerId: other.id, title: 'Theirs' });

    expect(await moveTrackToProject(db, track.id, deleted.id)).toBeNull();
    expect(await moveTrackToProject(db, track.id, theirs.id)).toBeNull();
    expect((await findTrack(db, track.id))?.projectId).toBeNull();

    const mine = await createProject(db, { ownerId: owner.id, title: 'Mine' });
    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, track.id));
    expect(await moveTrackToProject(db, track.id, mine.id)).toBeNull();
  });

  it('moves nothing when `from` no longer matches where the track is', async () => {
    const owner = await newUser();
    const a = await createProject(db, { ownerId: owner.id, title: 'A' });
    const b = await createProject(db, { ownerId: owner.id, title: 'B' });
    const track = await newTrack(owner.id);
    await moveTrackToProject(db, track.id, b.id);

    expect(await moveTrackToProject(db, track.id, null, { from: a.id })).toBeNull();
    expect(await findTrack(db, track.id)).toMatchObject({ projectId: b.id });

    expect(await moveTrackToProject(db, track.id, null, { from: b.id })).toMatchObject({
      projectId: null,
      position: null,
    });
    expect(await moveTrackToProject(db, track.id, null, { from: b.id })).toBeNull();
  });

  it('gives concurrent moves into one project distinct positions', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const all = await Promise.all(Array.from({ length: 5 }, () => newTrack(owner.id)));
    await Promise.all(all.map((t) => moveTrackToProject(db, t.id, project.id)));

    const positions = (await listProjectTracks(db, project.id)).map((t) => t.position);
    expect(positions).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('reorderProjectTracks', () => {
  async function projectWithTracks(count: number) {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const added = [];
    for (let i = 0; i < count; i++) {
      const track = await newTrack(owner.id, `Track ${i + 1}`);
      await moveTrackToProject(db, track.id, project.id);
      added.push(track);
    }
    return { owner, project, tracks: added };
  }

  it('puts the tracks in the given order', async () => {
    const {
      project,
      tracks: [t1, t2, t3],
    } = await projectWithTracks(3);
    const result = await reorderProjectTracks(db, project.id, [t3!.id, t1!.id, t2!.id]);
    expect(result.ok && ids(result.tracks)).toEqual([t3!.id, t1!.id, t2!.id]);
    expect(ids(await listProjectTracks(db, project.id))).toEqual([t3!.id, t1!.id, t2!.id]);
  });

  it('rejects a list that is missing, repeats, or adds a track, and changes nothing', async () => {
    const {
      owner,
      project,
      tracks: [t1, t2],
    } = await projectWithTracks(2);
    const loose = await newTrack(owner.id);
    for (const list of [[t1!.id], [t1!.id, t1!.id], [t2!.id, t1!.id, loose.id]]) {
      expect(await reorderProjectTracks(db, project.id, list)).toEqual({
        ok: false,
        reason: 'stale',
      });
    }
    expect(ids(await listProjectTracks(db, project.id))).toEqual([t1!.id, t2!.id]);
  });

  it('ignores deleted tracks, which no longer count as part of the project', async () => {
    const {
      project,
      tracks: [t1, t2],
    } = await projectWithTracks(2);
    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, t1!.id));
    expect((await reorderProjectTracks(db, project.id, [t2!.id])).ok).toBe(true);
  });

  it('returns not-found for a deleted project', async () => {
    const {
      project,
      tracks: [t1],
    } = await projectWithTracks(1);
    await deleteProject(db, project.id);
    expect(await reorderProjectTracks(db, project.id, [t1!.id])).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});

describe('deleteProject', () => {
  it('soft-deletes the project and leaves its tracks loose, with their versions', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const track = await newTrack(owner.id);
    await moveTrackToProject(db, track.id, project.id);

    expect((await deleteProject(db, project.id))?.deletedAt).toBeInstanceOf(Date);
    expect(await findProject(db, project.id)).toBeNull();
    expect(await findTrack(db, track.id)).toMatchObject({
      projectId: null,
      position: null,
      visibilityOverride: null,
    });
    expect(await listVersions(db, track.id)).toHaveLength(1);
    expect(await deleteProject(db, project.id)).toBeNull();
  });

  it("revokes the project's links, and only those", async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const other = await createProject(db, { ownerId: owner.id, title: 'Other EP' });
    const track = await newTrack(owner.id);
    await moveTrackToProject(db, track.id, project.id);
    const projectLink = await newLink(owner.id, 'project', project.id);
    const earlier = new Date('2026-10-01T00:00:00Z');
    const alreadyRevoked = await newLink(owner.id, 'project', project.id, { revokedAt: earlier });
    const otherLink = await newLink(owner.id, 'project', other.id);
    const trackLink = await newLink(owner.id, 'track', track.id);

    const deleted = await deleteProject(db, project.id);
    expect((await findLink(projectLink.id)).revokedAt).toEqual(deleted?.deletedAt);
    // Revoked earlier stays revoked as of then.
    expect((await findLink(alreadyRevoked.id)).revokedAt).toEqual(earlier);
    expect((await findLink(otherLink.id)).revokedAt).toBeNull();
    // The track lives on, loose, so a link made for it keeps working.
    expect((await findLink(trackLink.id)).revokedAt).toBeNull();
  });
});

describe('share_links constraints', () => {
  it('keeps token hashes unique', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const link = await newLink(owner.id, 'project', project.id);
    await expect(
      newLink(owner.id, 'project', project.id, { tokenHash: link.tokenHash }),
    ).rejects.toThrow();
  });

  it.each([
    ['too short', 'ab12'],
    ['upper case', 'A'.repeat(64)],
    ['not hex', 'z'.repeat(64)],
    ['a raw base64url token', 'q3Lx0vH9dJ2kR8sT1uW4yZ6bC5eF7gA0iK3mN9pQ2rS'],
  ])('only stores a SHA-256 hex hash, never anything else (%s)', async (_case, tokenHash) => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    await expect(newLink(owner.id, 'project', project.id, { tokenHash })).rejects.toThrow();
  });

  it("goes with its creator's account", async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const link = await newLink(owner.id, 'project', project.id);
    await db.delete(users).where(eq(users.id, owner.id));
    expect(await db.select().from(shareLinks).where(eq(shareLinks.id, link.id))).toEqual([]);
  });
});

describe('database constraints', () => {
  it("rejects a track in another owner's project", async () => {
    const owner = await newUser(1);
    const other = await newUser(2);
    const track = await newTrack(owner.id);
    const theirs = await createProject(db, { ownerId: other.id, title: 'Theirs' });
    await expect(
      db.update(tracks).set({ projectId: theirs.id, position: 0 }).where(eq(tracks.id, track.id)),
    ).rejects.toThrow();
  });

  it('requires a position exactly when the track is in a project', async () => {
    const owner = await newUser();
    const track = await newTrack(owner.id);
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    await expect(
      db.update(tracks).set({ position: 0 }).where(eq(tracks.id, track.id)),
    ).rejects.toThrow();
    await expect(
      db.update(tracks).set({ projectId: project.id }).where(eq(tracks.id, track.id)),
    ).rejects.toThrow();
  });

  it('deleting a user removes their projects and tracks together', async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    await moveTrackToProject(db, (await newTrack(owner.id)).id, project.id);
    await db.delete(users).where(eq(users.id, owner.id));
    expect(await db.select().from(projects)).toEqual([]);
    expect(await db.select().from(tracks)).toEqual([]);
  });
});

describe('visibility when tracks move (rule 7: moving never widens)', () => {
  async function setup(projectVisibility: 'private' | 'unlisted' | 'public') {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    await updateProject(db, project.id, { visibility: projectVisibility });
    return { owner, project };
  }

  it('a private track joining a public project gets a private override', async () => {
    const { owner, project } = await setup('public');
    const track = await newTrack(owner.id);
    expect(await moveTrackToProject(db, track.id, project.id)).toMatchObject({
      visibility: 'private',
      visibilityOverride: 'private',
    });
  });

  it('a public track joining a private project follows the project (narrower is safe)', async () => {
    const { owner, project } = await setup('private');
    const track = await newTrack(owner.id);
    await setTrackVisibility(db, track.id, 'public');
    expect(await moveTrackToProject(db, track.id, project.id)).toMatchObject({
      visibilityOverride: null,
    });
  });

  it('leaving a project keeps the visibility the track had there', async () => {
    const { owner, project } = await setup('unlisted');
    const track = await newTrack(owner.id);
    await setTrackVisibility(db, track.id, 'unlisted');
    await moveTrackToProject(db, track.id, project.id);
    expect(await moveTrackToProject(db, track.id, null)).toMatchObject({
      projectId: null,
      visibility: 'unlisted',
      visibilityOverride: null,
    });
  });

  it('moving between projects carries the effective visibility across', async () => {
    const { owner, project: unlisted } = await setup('unlisted');
    const open = await createProject(db, { ownerId: owner.id, title: 'Open' });
    await updateProject(db, open.id, { visibility: 'public' });
    const track = await newTrack(owner.id);
    await setTrackVisibility(db, track.id, 'unlisted');
    await moveTrackToProject(db, track.id, unlisted.id);
    expect(await moveTrackToProject(db, track.id, open.id)).toMatchObject({
      projectId: open.id,
      visibilityOverride: 'unlisted',
    });
  });

  it('deleting a project leaves each track with the visibility it had there', async () => {
    const { owner, project } = await setup('public');
    const following = await newTrack(owner.id, 'Follows the project');
    await setTrackVisibility(db, following.id, 'public');
    const overridden = await newTrack(owner.id, 'Kept private');
    await moveTrackToProject(db, following.id, project.id);
    await moveTrackToProject(db, overridden.id, project.id);
    await deleteProject(db, project.id);
    expect(await findTrack(db, following.id)).toMatchObject({
      visibility: 'public',
      visibilityOverride: null,
    });
    expect(await findTrack(db, overridden.id)).toMatchObject({
      visibility: 'private',
      visibilityOverride: null,
    });
  });
});

describe('setTrackVisibility', () => {
  it("sets a loose track's own visibility", async () => {
    const owner = await newUser();
    const track = await newTrack(owner.id);
    const result = await setTrackVisibility(db, track.id, 'unlisted');
    expect(result).toMatchObject({ ok: true, track: { visibility: 'unlisted' } });
  });

  it("sets a project track's override, and null follows the project again", async () => {
    const owner = await newUser();
    const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
    const track = await newTrack(owner.id);
    await moveTrackToProject(db, track.id, project.id);
    expect(await setTrackVisibility(db, track.id, 'public')).toMatchObject({
      ok: true,
      track: { visibilityOverride: 'public', visibility: 'private' },
    });
    expect(await setTrackVisibility(db, track.id, null)).toMatchObject({
      ok: true,
      track: { visibilityOverride: null },
    });
  });

  it('refuses null for a loose track, and reports a missing one', async () => {
    const owner = await newUser();
    const track = await newTrack(owner.id);
    expect(await setTrackVisibility(db, track.id, null)).toEqual({
      ok: false,
      reason: 'not-in-project',
    });
    expect(await findTrack(db, track.id)).toMatchObject({ visibility: 'private' });
    expect(await setTrackVisibility(db, '01890a5d-ac96-774b-bcce-b302099a8058', 'public')).toEqual({
      ok: false,
      reason: 'not-found',
    });
  });
});

describe('findProjectsByIds', () => {
  it('finds live projects by id, skipping deleted and unknown ones', async () => {
    const owner = await newUser();
    const a = await createProject(db, { ownerId: owner.id, title: 'A' });
    const b = await createProject(db, { ownerId: owner.id, title: 'B' });
    await deleteProject(db, b.id);
    const found = await findProjectsByIds(db, [a.id, b.id, a.id]);
    expect([...found.keys()]).toEqual([a.id]);
    expect(await findProjectsByIds(db, [])).toEqual(new Map());
  });
});

describe('withCurrentVersions', () => {
  const output = { streamKey: 'streams/x', durationMs: 3000, peaks: [0.5] };

  it('pairs tracks with their newest ready version, leaving out ones that have none', async () => {
    const owner = await newUser();
    const { track: played, version: v1 } = await createTrackWithFirstVersion(db, {
      ownerId: owner.id,
      title: 'Has a ready version',
      original,
    });
    await markVersionProcessing(db, v1.id);
    await markVersionReady(db, v1.id, output);
    // v2 still processing: listeners keep hearing v1.
    const v2 = await createNextVersion(db, { trackId: played.id, original });
    await markVersionProcessing(db, v2!.id);
    const unplayed = await newTrack(owner.id, 'Nothing ready');

    const rows = await withCurrentVersions(db, [
      (await findTrack(db, played.id))!,
      (await findTrack(db, unplayed.id))!,
    ]);
    expect(rows).toEqual([
      {
        track: expect.objectContaining({ id: played.id }),
        latestVersion: { id: v1.id, versionNumber: 1, status: 'ready', durationMs: 3000 },
      },
    ]);
  });
});
