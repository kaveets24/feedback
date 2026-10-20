import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createTrackWithFirstVersion,
  deleteProject,
  findProject,
  findTrack,
  listProjectTracks,
  markVersionProcessing,
  moveTrackToProject,
  setAccessStatus,
  tracks,
  trackVersions,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type {
  ProjectListResponse,
  ProjectResponse,
  ProjectTracksResponse,
  TrackListResponse,
} from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('project routes', () => {
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

  const call = (
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    url: string,
    providerId?: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
      ...(payload && { payload }),
    });

  describe('POST /v1/projects', () => {
    it('creates a private project in the idea status by default', async () => {
      await approvedUser('u1');

      const res = await call('POST', '/v1/projects', 'u1', { title: '  First EP  ' });
      expect(res.statusCode).toBe(201);
      const body = res.json<ProjectResponse>();
      expect(body).toMatchObject({
        title: 'First EP',
        description: null,
        status: 'idea',
        visibility: 'private',
      });
      expect(await findProject(db, body.id)).toMatchObject({ title: 'First EP' });
    });

    it('takes a description and status, and saves a blank description as none', async () => {
      await approvedUser('u1');

      const full = await call('POST', '/v1/projects', 'u1', {
        title: 'EP',
        description: 'Summer songs',
        status: 'demo',
      });
      expect(full.json<ProjectResponse>()).toMatchObject({
        description: 'Summer songs',
        status: 'demo',
      });

      const blank = await call('POST', '/v1/projects', 'u1', { title: 'EP', description: '   ' });
      expect(blank.json<ProjectResponse>().description).toBeNull();
    });

    it('rejects a missing or overlong title, an unknown status, or a visibility', async () => {
      await approvedUser('u1');
      for (const payload of [
        {},
        { title: '   ' },
        { title: 'x'.repeat(201) },
        { title: 'EP', description: 'x'.repeat(2001) },
        { title: 'EP', status: 'released' },
      ]) {
        expect((await call('POST', '/v1/projects', 'u1', payload)).statusCode).toBe(400);
      }
    });

    it('ignores a visibility sent with it: new projects are always private', async () => {
      await approvedUser('u1');
      const res = await call('POST', '/v1/projects', 'u1', { title: 'EP', visibility: 'public' });
      expect(res.json<ProjectResponse>().visibility).toBe('private');
    });

    it('requires signing in and approval', async () => {
      expect((await call('POST', '/v1/projects', undefined, { title: 'EP' })).statusCode).toBe(401);

      await upsertUserFromAuth(db, { authProviderId: 'p1', email: 'p1@x.test' });
      const pending = await call('POST', '/v1/projects', 'p1', { title: 'EP' });
      expect(pending.statusCode).toBe(403);
      expect(pending.json()).toMatchObject({ error: { code: 'ACCOUNT_PENDING' } });
    });
  });

  describe('GET /v1/projects', () => {
    it("lists only the signed-in user's live projects, newest first", async () => {
      const me = await approvedUser('u1');
      const other = await approvedUser('u2');
      await createProject(db, { ownerId: me.id, title: 'First' });
      const gone = await createProject(db, { ownerId: me.id, title: 'Deleted' });
      await createProject(db, { ownerId: me.id, title: 'Second' });
      await createProject(db, { ownerId: other.id, title: 'Not mine' });
      await deleteProject(db, gone.id);

      const res = await call('GET', '/v1/projects', 'u1');
      expect(res.statusCode).toBe(200);
      const body = res.json<ProjectListResponse>();
      expect(body.projects.map((p) => p.title)).toEqual(['Second', 'First']);
      expect(body.nextCursor).toBeNull();
    });

    it('pages with nextCursor until it is null', async () => {
      const me = await approvedUser('u1');
      for (const title of ['1', '2', '3', '4', '5'])
        await createProject(db, { ownerId: me.id, title });

      const titles: string[] = [];
      let url = '/v1/projects?limit=2';
      for (let pages = 1; ; pages++) {
        const body = (await call('GET', url, 'u1')).json<ProjectListResponse>();
        titles.push(...body.projects.map((p) => p.title));
        if (!body.nextCursor) {
          expect(pages).toBe(3);
          break;
        }
        url = `/v1/projects?limit=2&cursor=${body.nextCursor}`;
      }
      expect(titles).toEqual(['5', '4', '3', '2', '1']);
    });

    it('rejects a bad cursor or limit', async () => {
      await approvedUser('u1');
      for (const query of ['cursor=nope', 'limit=0', 'limit=101']) {
        expect((await call('GET', `/v1/projects?${query}`, 'u1')).statusCode).toBe(400);
      }
    });

    it('requires signing in', async () => {
      expect((await call('GET', '/v1/projects')).statusCode).toBe(401);
    });
  });

  describe('GET /v1/projects/:projectId', () => {
    it('returns the project to its owner', async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP', status: 'mixing' });

      const res = await call('GET', `/v1/projects/${project.id}`, 'u1');
      expect(res.statusCode).toBe(200);
      expect(res.json<ProjectResponse>()).toEqual({
        id: project.id,
        title: 'EP',
        description: null,
        status: 'mixing',
        visibility: 'private',
        cover: null,
        coverUpload: null,
        createdAt: project.createdAt.toISOString(),
      });
    });

    it('returns 404 to anyone else, and for missing or deleted projects', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });

      expect((await call('GET', `/v1/projects/${project.id}`, 'u2')).statusCode).toBe(404);
      expect((await call('GET', `/v1/projects/${project.id}`)).statusCode).toBe(404);
      expect((await call('GET', `/v1/projects/${crypto.randomUUID()}`, 'u1')).statusCode).toBe(404);

      await deleteProject(db, project.id);
      expect((await call('GET', `/v1/projects/${project.id}`, 'u1')).statusCode).toBe(404);
    });
  });

  describe('PATCH /v1/projects/:projectId', () => {
    it('changes only the fields sent, and clears the description with null', async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, {
        ownerId: me.id,
        title: 'EP',
        description: 'Summer songs',
      });
      const url = `/v1/projects/${project.id}`;

      const renamed = await call('PATCH', url, 'u1', { title: 'Summer EP', status: 'demo' });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json<ProjectResponse>()).toMatchObject({
        title: 'Summer EP',
        description: 'Summer songs',
        status: 'demo',
      });

      const cleared = await call('PATCH', url, 'u1', { description: null });
      expect(cleared.json<ProjectResponse>()).toMatchObject({
        title: 'Summer EP',
        description: null,
      });

      const unchanged = await call('PATCH', url, 'u1', {});
      expect(unchanged.json<ProjectResponse>()).toMatchObject({
        title: 'Summer EP',
        status: 'demo',
      });
    });

    it('rejects invalid changes', async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });
      for (const payload of [{ title: '' }, { title: null }, { status: 'released' }]) {
        const res = await call('PATCH', `/v1/projects/${project.id}`, 'u1', payload);
        expect(res.statusCode).toBe(400);
      }
    });

    it('changes visibility, and rejects one that isn’t a level', async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });
      const res = await call('PATCH', `/v1/projects/${project.id}`, 'u1', { visibility: 'public' });
      expect(res.statusCode).toBe(200);
      expect(res.json<ProjectResponse>().visibility).toBe('public');
      const bad = await call('PATCH', `/v1/projects/${project.id}`, 'u1', {
        visibility: 'friends',
      });
      expect(bad.statusCode).toBe(400);
    });

    it('returns 404 to anyone else and leaves the project alone', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });

      expect(
        (await call('PATCH', `/v1/projects/${project.id}`, 'u2', { title: 'Mine now' })).statusCode,
      ).toBe(404);
      expect(
        (await call('PATCH', `/v1/projects/${project.id}`, undefined, { title: 'Mine now' }))
          .statusCode,
      ).toBe(404);
      expect(await findProject(db, project.id)).toMatchObject({ title: 'EP' });

      await deleteProject(db, project.id);
      expect(
        (await call('PATCH', `/v1/projects/${project.id}`, 'u1', { title: 'Back' })).statusCode,
      ).toBe(404);
    });
  });

  describe('DELETE /v1/projects/:projectId', () => {
    it('deletes the project and leaves its tracks loose, with their versions', async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });
      const { track, version } = await createTrackWithFirstVersion(db, {
        ownerId: me.id,
        title: 'Song',
        original: { filename: 'song.wav', contentType: 'audio/wav', sizeBytes: 10 },
      });
      await moveTrackToProject(db, track.id, project.id);

      const res = await call('DELETE', `/v1/projects/${project.id}`, 'u1');
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');
      expect(await findProject(db, project.id)).toBeNull();
      expect(await findTrack(db, track.id)).toMatchObject({ projectId: null, position: null });

      const songs = await call('GET', `/v1/tracks/${track.id}`, 'u1');
      expect(songs.json()).toMatchObject({ versions: [{ id: version.id }] });

      expect((await call('DELETE', `/v1/projects/${project.id}`, 'u1')).statusCode).toBe(404);
    });

    it('returns 404 to anyone else and leaves the project alone', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });

      expect((await call('DELETE', `/v1/projects/${project.id}`, 'u2')).statusCode).toBe(404);
      expect((await call('DELETE', `/v1/projects/${project.id}`)).statusCode).toBe(404);
      expect((await call('DELETE', `/v1/projects/${crypto.randomUUID()}`, 'u1')).statusCode).toBe(
        404,
      );
      expect(await findProject(db, project.id)).not.toBeNull();
    });
  });

  describe('project tracks', () => {
    async function newTrack(ownerId: string, title: string) {
      const { track } = await createTrackWithFirstVersion(db, {
        ownerId,
        title,
        original: { filename: 'song.wav', contentType: 'audio/wav', sizeBytes: 10 },
      });
      return track;
    }

    /** A project of u1's holding tracks with these titles, in order. */
    async function projectWith(...titles: string[]) {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });
      const list = [];
      for (const title of titles) {
        const track = await newTrack(me.id, title);
        await moveTrackToProject(db, track.id, project.id);
        list.push(track);
      }
      return { me, project, tracks: list, url: `/v1/projects/${project.id}/tracks` };
    }

    const titles = (body: ProjectTracksResponse) => body.tracks.map((t) => t.title);
    const orderInDb = async (projectId: string) =>
      (await listProjectTracks(db, projectId)).map((t) => t.title);

    describe('GET /v1/projects/:projectId/tracks', () => {
      it('lists live tracks in order, each with its newest version', async () => {
        const {
          project,
          tracks: [a, , c],
          url,
        } = await projectWith('A', 'B', 'C');
        await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, c!.id));

        const res = await call('GET', url, 'u1');
        expect(res.statusCode).toBe(200);
        const body = res.json<ProjectTracksResponse>();
        expect(titles(body)).toEqual(['A', 'B']);
        expect(body.tracks[0]).toMatchObject({
          id: a!.id,
          projectId: project.id,
          latestVersion: { versionNumber: 1, status: 'uploading' },
        });
      });

      it('returns an empty list for an empty project', async () => {
        const { url } = await projectWith();
        expect((await call('GET', url, 'u1')).json()).toEqual({ tracks: [] });
      });

      it('returns 404 to anyone else, and for a deleted project', async () => {
        const { project, url } = await projectWith('A');
        await approvedUser('u2');
        expect((await call('GET', url, 'u2')).statusCode).toBe(404);
        expect((await call('GET', url)).statusCode).toBe(404);

        await deleteProject(db, project.id);
        expect((await call('GET', url, 'u1')).statusCode).toBe(404);
      });
    });

    describe('POST /v1/projects/:projectId/tracks', () => {
      it('adds a track to the end and returns the new list', async () => {
        const { me, project, url } = await projectWith('A');
        const b = await newTrack(me.id, 'B');
        // Arrived, so the track list shows it.
        const [v1] = await db.select().from(trackVersions).where(eq(trackVersions.trackId, b.id));
        await markVersionProcessing(db, v1!.id);

        const res = await call('POST', url, 'u1', { trackId: b.id });
        expect(res.statusCode).toBe(200);
        expect(titles(res.json<ProjectTracksResponse>())).toEqual(['A', 'B']);

        const list = (await call('GET', '/v1/tracks', 'u1')).json<TrackListResponse>();
        expect(list.tracks.find((t) => t.id === b.id)?.projectId).toBe(project.id);
      });

      it('leaves a track already in the project where it is', async () => {
        const {
          tracks: [a],
          url,
        } = await projectWith('A', 'B');
        const res = await call('POST', url, 'u1', { trackId: a!.id });
        expect(titles(res.json<ProjectTracksResponse>())).toEqual(['A', 'B']);
      });

      it('moves a track out of another project', async () => {
        const {
          me,
          project: first,
          tracks: [a],
        } = await projectWith('A');
        const second = await createProject(db, { ownerId: me.id, title: 'LP' });

        const res = await call('POST', `/v1/projects/${second.id}/tracks`, 'u1', {
          trackId: a!.id,
        });
        expect(titles(res.json<ProjectTracksResponse>())).toEqual(['A']);
        expect(await orderInDb(first.id)).toEqual([]);
      });

      it("returns 404 for someone else's track or project, and changes nothing", async () => {
        const { me, project, url } = await projectWith('A');
        const other = await approvedUser('u2');
        const theirTrack = await newTrack(other.id, 'Theirs');
        const theirProject = await createProject(db, { ownerId: other.id, title: 'Theirs' });
        const myTrack = await newTrack(me.id, 'Mine');

        // Their track into my project, mine into theirs, and theirs into mine by them.
        expect((await call('POST', url, 'u1', { trackId: theirTrack.id })).statusCode).toBe(404);
        const intoTheirs = `/v1/projects/${theirProject.id}/tracks`;
        expect((await call('POST', intoTheirs, 'u1', { trackId: myTrack.id })).statusCode).toBe(
          404,
        );
        expect((await call('POST', url, 'u2', { trackId: theirTrack.id })).statusCode).toBe(404);
        expect((await call('POST', url, undefined, { trackId: myTrack.id })).statusCode).toBe(404);

        expect(await orderInDb(project.id)).toEqual(['A']);
        expect(await orderInDb(theirProject.id)).toEqual([]);
        expect(await findTrack(db, theirTrack.id)).toMatchObject({ projectId: null });
      });

      it('returns 404 for a missing track or a deleted project, and 400 for a bad id', async () => {
        const { me, project, url } = await projectWith();
        const track = await newTrack(me.id, 'A');

        expect((await call('POST', url, 'u1', { trackId: crypto.randomUUID() })).statusCode).toBe(
          404,
        );
        expect((await call('POST', url, 'u1', { trackId: 'nope' })).statusCode).toBe(400);

        await deleteProject(db, project.id);
        expect((await call('POST', url, 'u1', { trackId: track.id })).statusCode).toBe(404);
        expect(await findTrack(db, track.id)).toMatchObject({ projectId: null });
      });
    });

    describe('PUT /v1/projects/:projectId/tracks', () => {
      it('puts the tracks in the given order', async () => {
        const {
          project,
          tracks: [a, b, c],
          url,
        } = await projectWith('A', 'B', 'C');

        const res = await call('PUT', url, 'u1', { trackIds: [c!.id, a!.id, b!.id] });
        expect(res.statusCode).toBe(200);
        expect(titles(res.json<ProjectTracksResponse>())).toEqual(['C', 'A', 'B']);
        expect(await orderInDb(project.id)).toEqual(['C', 'A', 'B']);
      });

      it('returns 409 for a list that no longer matches the project, and changes nothing', async () => {
        const {
          me,
          project,
          tracks: [a, b],
          url,
        } = await projectWith('A', 'B');
        const loose = await newTrack(me.id, 'Loose');

        for (const trackIds of [[b!.id], [b!.id, a!.id, a!.id], [b!.id, a!.id, loose.id]]) {
          const res = await call('PUT', url, 'u1', { trackIds });
          expect(res.statusCode).toBe(409);
          expect(res.json()).toMatchObject({ error: { code: 'STALE_TRACK_ORDER' } });
        }
        expect(await orderInDb(project.id)).toEqual(['A', 'B']);
      });

      it('returns 404 to anyone else and 400 for bad ids', async () => {
        const {
          project,
          tracks: [a, b],
          url,
        } = await projectWith('A', 'B');
        await approvedUser('u2');
        const reversed = { trackIds: [b!.id, a!.id] };

        expect((await call('PUT', url, 'u2', reversed)).statusCode).toBe(404);
        expect((await call('PUT', url, undefined, reversed)).statusCode).toBe(404);
        expect((await call('PUT', url, 'u1', { trackIds: ['nope'] })).statusCode).toBe(400);
        expect(await orderInDb(project.id)).toEqual(['A', 'B']);
      });
    });

    describe('DELETE /v1/projects/:projectId/tracks/:trackId', () => {
      it('takes the track out, leaving it loose', async () => {
        const {
          project,
          tracks: [a],
          url,
        } = await projectWith('A', 'B');

        const res = await call('DELETE', `${url}/${a!.id}`, 'u1');
        expect(res.statusCode).toBe(204);
        expect(await orderInDb(project.id)).toEqual(['B']);
        expect(await findTrack(db, a!.id)).toMatchObject({ projectId: null, position: null });

        expect((await call('DELETE', `${url}/${a!.id}`, 'u1')).statusCode).toBe(404);
      });

      it('returns 404 for a track in a different project, and leaves it there', async () => {
        const { me, url } = await projectWith();
        const other = await createProject(db, { ownerId: me.id, title: 'LP' });
        const track = await newTrack(me.id, 'A');
        await moveTrackToProject(db, track.id, other.id);

        expect((await call('DELETE', `${url}/${track.id}`, 'u1')).statusCode).toBe(404);
        expect(await findTrack(db, track.id)).toMatchObject({ projectId: other.id });
      });

      it('returns 404 to anyone else and leaves the track in place', async () => {
        const {
          project,
          tracks: [a],
          url,
        } = await projectWith('A');
        await approvedUser('u2');

        expect((await call('DELETE', `${url}/${a!.id}`, 'u2')).statusCode).toBe(404);
        expect((await call('DELETE', `${url}/${a!.id}`)).statusCode).toBe(404);
        expect(await orderInDb(project.id)).toEqual(['A']);
      });
    });
  });
});
