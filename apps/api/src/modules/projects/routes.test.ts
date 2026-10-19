import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createTrackWithFirstVersion,
  deleteProject,
  findProject,
  findTrack,
  moveTrackToProject,
  setAccessStatus,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { ProjectListResponse, ProjectResponse } from '@feedback/shared';
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
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

    it("doesn't change visibility", async () => {
      const me = await approvedUser('u1');
      const project = await createProject(db, { ownerId: me.id, title: 'EP' });
      const res = await call('PATCH', `/v1/projects/${project.id}`, 'u1', { visibility: 'public' });
      expect(res.json<ProjectResponse>().visibility).toBe('private');
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
});
