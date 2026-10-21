import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  findAvatar,
  markAvatarFailed,
  markAvatarProcessing,
  markAvatarReady,
  setAccessStatus,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import { MAX_COVER_BYTES, type CreateAvatarResponse, type ProfileResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor, type FakeQueue } from '../../testing/app.ts';
import { COVER_FAILURE_REASONS } from '../covers/service.ts';

/** The first bytes of a PNG; the API only sniffs them (the worker does the real decoding). */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49]);

const auth = (providerId: string) => ({ authorization: `Bearer ${tokenFor(providerId)}` });

describe('avatar routes', () => {
  let app: App;
  let db: Db;
  let queue: FakeQueue;

  beforeAll(async () => {
    ({ app, db, queue } = await buildTestApp());
  });
  beforeEach(async () => {
    await resetDb(db);
    queue.avatars.length = 0;
    queue.failWith = null;
  });
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
      headers: providerId ? auth(providerId) : {},
      ...(payload && { payload }),
    });

  const image = { contentType: 'image/png', sizeBytes: PNG.length };

  async function start(providerId = 'u1', body: object = image) {
    const res = await call('POST', '/v1/me/avatars', providerId, body);
    expect(res.statusCode).toBe(201);
    return res.json<CreateAvatarResponse>();
  }

  const put = ({ upload }: CreateAvatarResponse, body: Uint8Array) =>
    fetch(upload.url, { method: upload.method, headers: upload.headers, body });

  const complete = (avatarId: string, providerId = 'u1') =>
    call('POST', `/v1/me/avatars/${avatarId}/complete`, providerId);

  const profile = (providerId = 'u1') =>
    call('GET', '/v1/me/profile', providerId).then((r) => r.json<ProfileResponse>());

  /** A picture the worker would have finished: processing, then ready with a stored key. */
  async function readyAvatar(providerId = 'u1') {
    const started = await start(providerId);
    await markAvatarProcessing(db, started.avatarId);
    await markAvatarReady(db, started.avatarId, `avatars/${started.avatarId}.jpg`);
    return started.avatarId;
  }

  describe('POST /v1/me/avatars', () => {
    it('records an uploading picture and returns a signed PUT for its original', async () => {
      const user = await approvedUser('u1');
      const started = await start();

      expect(started.upload).toMatchObject({
        method: 'PUT',
        headers: { 'content-type': 'image/png' },
      });
      expect(new URL(started.upload.url).pathname).toContain(
        `avatar-originals/${started.avatarId}`,
      );
      expect(await findAvatar(db, started.avatarId)).toMatchObject({
        userId: user.id,
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
      await approvedUser('u1');
      expect((await call('POST', '/v1/me/avatars', 'u1', body)).statusCode).toBe(400);
    });

    it('needs a signed-in, approved account', async () => {
      expect((await call('POST', '/v1/me/avatars', undefined, image)).statusCode).toBe(401);
      await upsertUserFromAuth(db, { authProviderId: 'pending', email: 'pending@x.test' });
      const res = await call('POST', '/v1/me/avatars', 'pending', image);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ACCOUNT_PENDING');
    });
  });

  describe('POST /v1/me/avatars/:avatarId/complete', () => {
    it('checks the image, moves it to processing, and queues it; safe to repeat', async () => {
      await approvedUser('u1');
      const started = await start();
      expect((await put(started, PNG)).status).toBe(200);

      const res = await complete(started.avatarId);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: started.avatarId,
        status: 'processing',
        failureReason: null,
      });
      expect((await complete(started.avatarId)).json().status).toBe('processing');
      expect(queue.avatars).toEqual([started.avatarId, started.avatarId]);
    });

    it('returns 409 before the image is uploaded, and leaves it uploading', async () => {
      await approvedUser('u1');
      const started = await start();
      const res = await complete(started.avatarId);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('UPLOAD_INCOMPLETE');
      expect((await findAvatar(db, started.avatarId))?.status).toBe('uploading');
    });

    it('fails a file that is not an image, whatever it was called, without queueing', async () => {
      await approvedUser('u1');
      const gif = new TextEncoder().encode('GIF89a-not-a-png');
      const started = await start('u1', { contentType: 'image/png', sizeBytes: gif.length });
      await put(started, gif);

      expect((await complete(started.avatarId)).json()).toEqual({
        id: started.avatarId,
        status: 'failed',
        failureReason: COVER_FAILURE_REASONS.notImage,
      });
      expect(queue.avatars).toEqual([]);
    });

    it("returns 404 for someone else's upload, and leaves it alone", async () => {
      await approvedUser('u1');
      await approvedUser('u2');
      const started = await start();
      await put(started, PNG);

      expect((await complete(started.avatarId, 'u2')).statusCode).toBe(404);
      expect((await complete(crypto.randomUUID())).statusCode).toBe(404);
      expect((await findAvatar(db, started.avatarId))?.status).toBe('uploading');
    });
  });

  describe('GET /v1/me/avatars/:avatarId', () => {
    it('returns the upload state to its owner, and 404 to anyone else', async () => {
      await approvedUser('u1');
      await approvedUser('u2');
      const started = await start();
      await markAvatarFailed(db, started.avatarId, 'Too small');

      const url = `/v1/me/avatars/${started.avatarId}`;
      expect((await call('GET', url, 'u1')).json()).toEqual({
        id: started.avatarId,
        status: 'failed',
        failureReason: 'Too small',
      });
      expect((await call('GET', url, 'u2')).statusCode).toBe(404);
      expect((await call('GET', url)).statusCode).toBe(401);
    });
  });

  describe('pictures on the profile', () => {
    it('gives a short-lived signed URL once ready, only on your own profile', async () => {
      await approvedUser('u1');
      await approvedUser('u2');
      expect((await profile()).avatar).toBeNull();
      const avatarId = await readyAvatar();

      const before = Date.now();
      const mine = await profile();
      expect(new URL(mine.avatar!.url).pathname).toContain(`avatars/${avatarId}.jpg`);
      const expiresIn = Date.parse(mine.avatar!.expiresAt) - before;
      expect(expiresIn).toBeGreaterThan(9 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(10 * 60_000 + 1000);
      expect(mine.avatarUpload).toBeNull();

      expect((await profile('u2')).avatar).toBeNull();
    });

    it('reports a newer upload while it processes or after it fails, keeping the old one', async () => {
      await approvedUser('u1');
      const avatarId = await readyAvatar();
      const next = await start();
      expect((await profile()).avatarUpload).toBeNull();

      await markAvatarProcessing(db, next.avatarId);
      expect((await profile()).avatarUpload).toEqual({
        id: next.avatarId,
        status: 'processing',
        failureReason: null,
      });
      await markAvatarFailed(db, next.avatarId, 'Bad image');
      const failed = await profile();
      expect(failed.avatarUpload).toMatchObject({ status: 'failed', failureReason: 'Bad image' });
      expect(new URL(failed.avatar!.url).pathname).toContain(`avatars/${avatarId}.jpg`);
    });

    it('keeps the picture when the rest of the profile is saved', async () => {
      await approvedUser('u1');
      await readyAvatar();
      const res = await call('PATCH', '/v1/me/profile', 'u1', { displayName: 'Night Owl' });
      expect(res.json<ProfileResponse>().avatar).not.toBeNull();
    });
  });

  describe('DELETE /v1/me/avatar', () => {
    it('takes your picture off, and is harmless with none', async () => {
      await approvedUser('u1');
      await readyAvatar();

      expect((await call('DELETE', '/v1/me/avatar', 'u1')).statusCode).toBe(204);
      expect((await profile()).avatar).toBeNull();
      expect((await call('DELETE', '/v1/me/avatar', 'u1')).statusCode).toBe(204);
      expect((await call('DELETE', '/v1/me/avatar')).statusCode).toBe(401);
    });

    it("never touches anyone else's picture", async () => {
      await approvedUser('u1');
      await approvedUser('u2');
      await readyAvatar('u2');
      await call('DELETE', '/v1/me/avatar', 'u1');
      expect((await profile('u2')).avatar).not.toBeNull();
    });
  });
});
