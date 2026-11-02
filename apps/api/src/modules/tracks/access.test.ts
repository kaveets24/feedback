import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createCover,
  createNextVersion,
  createProject,
  createTrackWithFirstVersion,
  markCoverProcessing,
  markVersionFailed,
  markVersionProcessing,
  markVersionReady,
  moveTrackToProject,
  setAccessStatus,
  setTrackVisibility,
  tracks,
  updateProject,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { Visibility } from '@feedback/authz';
import type {
  ProjectDetailResponse,
  ProjectTracksResponse,
  TrackResponse,
  VersionResponse,
} from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

/**
 * What people other than the owner get from the track, version and project routes, by effective
 * visibility (CLAUDE.md section 6). Share links arrive in a later PR; until then unlisted is as
 * closed as private to everyone but the owner.
 */
describe('access by visibility', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  async function approvedUser(providerId: string) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    await setAccessStatus(db, { email, status: 'approved' });
    return user;
  }

  const original = {
    filename: 'night-drive-final-for-label.wav',
    contentType: 'audio/wav',
    sizeBytes: 10,
  };

  async function ready(versionId: string) {
    await markVersionProcessing(db, versionId);
    await markVersionReady(db, versionId, {
      streamKey: `streams/${versionId}`,
      durationMs: 3000,
      peaks: [0, 0.5, 1],
    });
  }

  /** A track with a ready v1, a failed v2 and a processing v3, at the given visibility. */
  async function track(ownerId: string, visibility: Visibility, title = 'Night drive') {
    const { track, version: v1 } = await createTrackWithFirstVersion(db, {
      ownerId,
      title,
      original,
    });
    await ready(v1.id);
    const v2 = (await createNextVersion(db, { trackId: track.id, original }))!;
    await markVersionProcessing(db, v2.id);
    await markVersionFailed(db, v2.id, 'Bad file');
    const v3 = (await createNextVersion(db, { trackId: track.id, original }))!;
    await markVersionProcessing(db, v3.id);
    await db
      .update(tracks)
      .set({ notes: 'Ask Sam about the bridge' })
      .where(eq(tracks.id, track.id));
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    return { track, v1, v2, v3 };
  }

  const call = (method: 'GET' | 'PATCH', url: string, providerId?: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
      ...(payload && { payload }),
    });

  describe('a public track', () => {
    it.each([
      ['anonymous', undefined],
      ['a signed-in stranger', 'u2'],
    ])('%s sees it, with only ready versions and no file names or notes', async (_who, as) => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track: t, v1 } = await track(owner.id, 'public');

      const res = await call('GET', `/v1/tracks/${t.id}`, as);
      expect(res.statusCode).toBe(200);
      const body = res.json<TrackResponse>();
      expect(body).toMatchObject({
        visibility: 'public',
        notes: null,
        projectId: null,
        canManage: false,
      });
      expect(body.versions).toEqual([
        expect.objectContaining({ id: v1.id, status: 'ready', originalFilename: null }),
      ]);
    });

    it('can be played and its ready version read, but not one still in the works', async () => {
      const owner = await approvedUser('u1');
      const { v1, v2, v3 } = await track(owner.id, 'public');

      expect((await call('GET', `/v1/versions/${v1.id}/stream`)).statusCode).toBe(200);
      const version = await call('GET', `/v1/versions/${v1.id}`);
      expect(version.json<VersionResponse>()).toMatchObject({ originalFilename: null });
      for (const hidden of [v2, v3]) {
        expect((await call('GET', `/v1/versions/${hidden.id}`)).statusCode).toBe(404);
        expect((await call('GET', `/v1/versions/${hidden.id}/stream`)).statusCode).toBe(404);
      }
    });

    it('stays the owner’s to change', async () => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track: t, v1 } = await track(owner.id, 'public');

      for (const as of [undefined, 'u2']) {
        expect(
          (await call('PATCH', `/v1/tracks/${t.id}`, as, { visibility: 'private' })).statusCode,
        ).toBe(404);
        expect(
          (await call('PATCH', `/v1/versions/${v1.id}`, as, { changeNotes: 'Mine' })).statusCode,
        ).toBe(404);
      }
    });

    it('still shows its owner everything', async () => {
      const owner = await approvedUser('u1');
      const { track: t } = await track(owner.id, 'public');
      const body = (await call('GET', `/v1/tracks/${t.id}`, 'u1')).json<TrackResponse>();
      expect(body.notes).toBe('Ask Sam about the bridge');
      expect(body.canManage).toBe(true);
      expect(body.versions.map((v) => [v.status, v.originalFilename])).toEqual([
        ['processing', original.filename],
        ['failed', original.filename],
        ['ready', original.filename],
      ]);
    });
  });

  it.each(['private', 'unlisted'] as const)(
    'a %s track is a 404 to everyone but its owner',
    async (visibility) => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track: t, v1 } = await track(owner.id, visibility);

      for (const as of [undefined, 'u2']) {
        expect((await call('GET', `/v1/tracks/${t.id}`, as)).statusCode).toBe(404);
        expect((await call('GET', `/v1/versions/${v1.id}`, as)).statusCode).toBe(404);
        expect((await call('GET', `/v1/versions/${v1.id}/stream`, as)).statusCode).toBe(404);
      }
      expect((await call('GET', `/v1/tracks/${t.id}`, 'u1')).statusCode).toBe(200);
    },
  );

  describe('tracks in a project (rule 7)', () => {
    async function inProject(projectVisibility: Visibility) {
      const owner = await approvedUser('u1');
      const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
      await updateProject(db, project.id, { visibility: projectVisibility });
      return { owner, project };
    }

    it('a track following a public project is public, and links to it', async () => {
      const { owner, project } = await inProject('public');
      const { track: t } = await track(owner.id, 'private');
      await moveTrackToProject(db, t.id, project.id);
      // Joining a wider project kept it private; follow the project instead.
      await setTrackVisibility(db, t.id, null);

      const body = (await call('GET', `/v1/tracks/${t.id}`)).json<TrackResponse>();
      expect(body).toMatchObject({
        projectId: project.id,
        visibility: 'public',
        inheritsVisibility: true,
      });
    });

    it('a private override in a public project hides the track', async () => {
      const { owner, project } = await inProject('public');
      const { track: t } = await track(owner.id, 'private');
      await moveTrackToProject(db, t.id, project.id);
      expect((await call('GET', `/v1/tracks/${t.id}`)).statusCode).toBe(404);
    });

    it('a public override in an unlisted project shows the track, but not which project', async () => {
      const { owner, project } = await inProject('unlisted');
      const { track: t } = await track(owner.id, 'private');
      await moveTrackToProject(db, t.id, project.id);
      await setTrackVisibility(db, t.id, 'public');

      const body = (await call('GET', `/v1/tracks/${t.id}`)).json<TrackResponse>();
      expect(body).toMatchObject({ visibility: 'public', projectId: null });
    });

    it('making the project private hides the tracks that follow it', async () => {
      const { owner, project } = await inProject('public');
      const { track: t } = await track(owner.id, 'public');
      await moveTrackToProject(db, t.id, project.id);
      expect((await call('GET', `/v1/tracks/${t.id}`)).statusCode).toBe(200);

      await call('PATCH', `/v1/projects/${project.id}`, 'u1', { visibility: 'private' });
      expect((await call('GET', `/v1/tracks/${t.id}`)).statusCode).toBe(404);
      expect((await call('GET', `/v1/projects/${project.id}`)).statusCode).toBe(404);
    });

    it('a public project lists only the tracks a listener may hear, with their current version', async () => {
      const { owner, project } = await inProject('public');
      const open = await track(owner.id, 'public', 'Open');
      const hidden = await track(owner.id, 'private', 'Hidden');
      const unplayed = (
        await createTrackWithFirstVersion(db, { ownerId: owner.id, title: 'Unplayed', original })
      ).track;
      for (const id of [open.track.id, hidden.track.id, unplayed.id]) {
        await moveTrackToProject(db, id, project.id);
      }
      await setTrackVisibility(db, unplayed.id, null);

      const anon = (
        await call('GET', `/v1/projects/${project.id}/tracks`)
      ).json<ProjectTracksResponse>();
      expect(anon.tracks.map((t) => [t.title, t.latestVersion.versionNumber])).toEqual([
        ['Open', 1],
      ]);
      const mine = (
        await call('GET', `/v1/projects/${project.id}/tracks`, 'u1')
      ).json<ProjectTracksResponse>();
      expect(mine.tracks.map((t) => [t.title, t.latestVersion.versionNumber])).toEqual([
        ['Open', 3],
        ['Hidden', 3],
        ['Unplayed', 1],
      ]);
    });

    it('a public project hides its cover upload progress from listeners', async () => {
      const { project } = await inProject('public');
      const cover = await createCover(db, {
        projectId: project.id,
        contentType: 'image/png',
        sizeBytes: 10,
      });
      await markCoverProcessing(db, cover.id);

      const res = await call('GET', `/v1/projects/${project.id}`);
      expect(res.statusCode).toBe(200);
      expect(res.json<ProjectDetailResponse>()).toMatchObject({
        coverUpload: null,
        canManage: false,
      });
      const mine = await call('GET', `/v1/projects/${project.id}`, 'u1');
      expect(mine.json<ProjectDetailResponse>()).toMatchObject({
        coverUpload: { status: 'processing' },
        canManage: true,
      });
      const status = await call('GET', `/v1/projects/${project.id}/covers/${cover.id}`);
      expect(status.statusCode).toBe(404);
    });
  });

  describe('PATCH /v1/tracks/:trackId', () => {
    it("sets a loose track's visibility", async () => {
      const owner = await approvedUser('u1');
      const { track: t } = await track(owner.id, 'private');
      const res = await call('PATCH', `/v1/tracks/${t.id}`, 'u1', { visibility: 'unlisted' });
      expect(res.statusCode).toBe(200);
      expect(res.json<TrackResponse>()).toMatchObject({
        visibility: 'unlisted',
        inheritsVisibility: false,
      });
    });

    it('refuses to make a loose track follow a project it isn’t in', async () => {
      const owner = await approvedUser('u1');
      const { track: t } = await track(owner.id, 'private');
      const res = await call('PATCH', `/v1/tracks/${t.id}`, 'u1', { visibility: null });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: 'TRACK_NOT_IN_PROJECT' } });
    });

    it("overrides a project track's visibility, and null follows the project again", async () => {
      const owner = await approvedUser('u1');
      const project = await createProject(db, { ownerId: owner.id, title: 'EP' });
      await updateProject(db, project.id, { visibility: 'unlisted' });
      const { track: t } = await track(owner.id, 'private');
      await moveTrackToProject(db, t.id, project.id);

      const widened = await call('PATCH', `/v1/tracks/${t.id}`, 'u1', { visibility: 'public' });
      expect(widened.json<TrackResponse>()).toMatchObject({
        visibility: 'public',
        inheritsVisibility: false,
      });
      const following = await call('PATCH', `/v1/tracks/${t.id}`, 'u1', { visibility: null });
      expect(following.json<TrackResponse>()).toMatchObject({
        visibility: 'unlisted',
        inheritsVisibility: true,
      });
    });

    it('rejects a visibility that isn’t a level, and a missing one', async () => {
      const owner = await approvedUser('u1');
      const { track: t } = await track(owner.id, 'private');
      expect(
        (await call('PATCH', `/v1/tracks/${t.id}`, 'u1', { visibility: 'friends' })).statusCode,
      ).toBe(400);
      expect((await call('PATCH', `/v1/tracks/${t.id}`, 'u1', {})).statusCode).toBe(400);
    });
  });
});
