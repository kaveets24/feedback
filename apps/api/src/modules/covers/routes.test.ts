import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  findCover,
  markCoverFailed,
  markCoverProcessing,
  markCoverReady,
  setAccessStatus,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import {
  MAX_COVER_BYTES,
  type CreateCoverResponse,
  type ProjectDetailResponse,
  type ProjectListResponse,
} from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor, type FakeQueue } from '../../testing/app.ts';
import { COVER_FAILURE_REASONS } from './service.ts';

/** The first bytes of a PNG; the API only sniffs them (the worker does the real decoding). */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49]);

const auth = (providerId: string) => ({ authorization: `Bearer ${tokenFor(providerId)}` });

describe('cover routes', () => {
  let app: App;
  let db: Db;
  let queue: FakeQueue;

  beforeAll(async () => {
    ({ app, db, queue } = await buildTestApp());
  });
  beforeEach(async () => {
    await resetDb(db);
    queue.covers.length = 0;
    queue.failWith = null;
  });
  afterAll(() => app.close());

  async function approvedUser(providerId: string) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    await setAccessStatus(db, { email, status: 'approved' });
    return user;
  }

  async function ownProject(providerId = 'u1') {
    const owner = await approvedUser(providerId);
    return createProject(db, { ownerId: owner.id, title: 'EP' });
  }

  const call = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    providerId?: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: providerId ? auth(providerId) : {},
      ...(payload && { payload }),
    });

  const image = { contentType: 'image/png', sizeBytes: PNG.length };

  async function start(projectId: string, providerId = 'u1', body: object = image) {
    const res = await call('POST', `/v1/projects/${projectId}/covers`, providerId, body);
    expect(res.statusCode).toBe(201);
    return res.json<CreateCoverResponse>();
  }

  const put = ({ upload }: CreateCoverResponse, body: Uint8Array) =>
    fetch(upload.url, { method: upload.method, headers: upload.headers, body });

  const complete = (projectId: string, coverId: string, providerId = 'u1') =>
    call('POST', `/v1/projects/${projectId}/covers/${coverId}/complete`, providerId);

  /** A cover the worker would have finished: processing, then ready with a stored key. */
  async function readyCover(projectId: string) {
    const started = await start(projectId);
    await markCoverProcessing(db, started.coverId);
    await markCoverReady(db, started.coverId, `covers/${started.coverId}.jpg`);
    return started.coverId;
  }

  describe('POST /v1/projects/:projectId/covers', () => {
    it('records an uploading cover and returns a signed PUT for its original', async () => {
      const project = await ownProject();
      const started = await start(project.id);

      expect(started.upload).toMatchObject({
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
      });
      expect(new URL(started.upload.url).pathname).toContain(`cover-originals/${started.coverId}`);
      expect((await findCover(db, started.coverId))?.cover).toMatchObject({
        projectId: project.id,
        status: 'uploading',
        originalContentType: 'image/png',
        originalSizeBytes: PNG.length,
      });
    });

    it.each([
      ['a GIF', { contentType: 'image/gif', sizeBytes: 10 }],
      ['an SVG', { contentType: 'image/svg+xml', sizeBytes: 10 }],
      ['an image over 10 MB', { contentType: 'image/jpeg', sizeBytes: MAX_COVER_BYTES + 1 }],
      ['an empty file', { contentType: 'image/jpeg', sizeBytes: 0 }],
    ])('rejects %s', async (_label, body) => {
      const project = await ownProject();
      expect((await call('POST', `/v1/projects/${project.id}/covers`, 'u1', body)).statusCode).toBe(
        400,
      );
    });

    it('returns 404 to anyone else and for a missing project', async () => {
      const project = await ownProject();
      await approvedUser('u2');
      const url = `/v1/projects/${project.id}/covers`;
      expect((await call('POST', url, 'u2', image)).statusCode).toBe(404);
      expect((await call('POST', url, undefined, image)).statusCode).toBe(404);
      expect(
        (await call('POST', `/v1/projects/${crypto.randomUUID()}/covers`, 'u1', image)).statusCode,
      ).toBe(404);
    });
  });

  describe('POST /v1/projects/:projectId/covers/:coverId/complete', () => {
    it('checks the image, moves it to processing, and queues it; safe to repeat', async () => {
      const project = await ownProject();
      const started = await start(project.id);
      expect((await put(started, PNG)).status).toBe(200);

      const res = await complete(project.id, started.coverId);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: started.coverId,
        status: 'processing',
        failureReason: null,
      });
      expect((await complete(project.id, started.coverId)).json().status).toBe('processing');
      expect(queue.covers).toEqual([started.coverId, started.coverId]);
    });

    it('returns 409 before the image is uploaded, and leaves it uploading', async () => {
      const project = await ownProject();
      const started = await start(project.id);
      const res = await complete(project.id, started.coverId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('UPLOAD_INCOMPLETE');
      expect((await findCover(db, started.coverId))?.cover.status).toBe('uploading');
    });

    it('fails a file that is not an image, whatever it was called, without queueing', async () => {
      const project = await ownProject();
      const gif = new TextEncoder().encode('GIF89a-not-a-png');
      const started = await start(project.id, 'u1', {
        contentType: 'image/png',
        sizeBytes: gif.length,
      });
      await put(started, gif);

      expect((await complete(project.id, started.coverId)).json()).toEqual({
        id: started.coverId,
        status: 'failed',
        failureReason: COVER_FAILURE_REASONS.notImage,
      });
      expect(queue.covers).toEqual([]);
    });

    it("returns 404 to anyone else, and for another project's cover", async () => {
      const project = await ownProject();
      const other = await createProject(db, { ownerId: project.ownerId, title: 'Other' });
      await approvedUser('u2');
      const started = await start(project.id);
      await put(started, PNG);

      expect((await complete(project.id, started.coverId, 'u2')).statusCode).toBe(404);
      expect((await complete(other.id, started.coverId)).statusCode).toBe(404);
      expect((await findCover(db, started.coverId))?.cover.status).toBe('uploading');
    });
  });

  describe('GET /v1/projects/:projectId/covers/:coverId', () => {
    it('returns the upload state to the owner, and 404 to anyone else', async () => {
      const project = await ownProject();
      await approvedUser('u2');
      const started = await start(project.id);
      await markCoverFailed(db, started.coverId, 'Too small');

      const url = `/v1/projects/${project.id}/covers/${started.coverId}`;
      expect((await call('GET', url, 'u1')).json()).toEqual({
        id: started.coverId,
        status: 'failed',
        failureReason: 'Too small',
      });
      expect((await call('GET', url, 'u2')).statusCode).toBe(404);
    });
  });

  describe('covers on project responses', () => {
    it('gives the project a short-lived signed cover URL once a cover is ready', async () => {
      const project = await ownProject();
      expect((await call('GET', `/v1/projects/${project.id}`, 'u1')).json().cover).toBeNull();
      const coverId = await readyCover(project.id);

      const before = Date.now();
      const body = (
        await call('GET', `/v1/projects/${project.id}`, 'u1')
      ).json<ProjectDetailResponse>();
      expect(new URL(body.cover!.url).pathname).toContain(`covers/${coverId}.jpg`);
      const expiresIn = Date.parse(body.cover!.expiresAt) - before;
      expect(expiresIn).toBeGreaterThan(9 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(10 * 60_000 + 1000);
      expect(body.coverUpload).toBeNull();

      const list = (await call('GET', '/v1/projects', 'u1')).json<ProjectListResponse>();
      expect(new URL(list.projects[0]!.cover!.url).pathname).toContain(`covers/${coverId}.jpg`);
    });

    it('reports a newer upload while it processes or after it fails, keeping the old cover', async () => {
      const project = await ownProject();
      const coverId = await readyCover(project.id);
      const next = await start(project.id);

      // Still uploading: nothing to say yet.
      const detail = () =>
        call('GET', `/v1/projects/${project.id}`, 'u1').then((r) =>
          r.json<ProjectDetailResponse>(),
        );
      expect((await detail()).coverUpload).toBeNull();

      await markCoverProcessing(db, next.coverId);
      expect((await detail()).coverUpload).toEqual({
        id: next.coverId,
        status: 'processing',
        failureReason: null,
      });
      await markCoverFailed(db, next.coverId, 'Bad image');
      const failed = await detail();
      expect(failed.coverUpload).toMatchObject({ status: 'failed', failureReason: 'Bad image' });
      expect(new URL(failed.cover!.url).pathname).toContain(`covers/${coverId}.jpg`);
    });
  });

  describe('DELETE /v1/projects/:projectId/cover', () => {
    it('takes the cover off, and returns 404 to anyone else', async () => {
      const project = await ownProject();
      await approvedUser('u2');
      await readyCover(project.id);
      const url = `/v1/projects/${project.id}/cover`;

      expect((await call('DELETE', url, 'u2')).statusCode).toBe(404);
      expect((await call('GET', `/v1/projects/${project.id}`, 'u1')).json().cover).not.toBeNull();

      expect((await call('DELETE', url, 'u1')).statusCode).toBe(204);
      expect((await call('GET', `/v1/projects/${project.id}`, 'u1')).json().cover).toBeNull();
    });
  });
});
