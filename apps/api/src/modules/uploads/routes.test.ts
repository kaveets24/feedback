import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  deleteProject,
  findTrack,
  findVersion,
  markVersionFailed,
  markVersionProcessing,
  markVersionReady,
  setAccessStatus,
  updateProject,
  trackVersions,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import { MAX_UPLOAD_BYTES, type CreateUploadResponse } from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor, type FakeQueue } from '../../testing/app.ts';
import { FAILURE_REASONS } from './service.ts';

/** A real (silent) 16-bit mono WAV file. */
function wav(samples = 1000): Uint8Array {
  const dataSize = samples * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const text = (offset: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 44_100, true);
  view.setUint32(28, 88_200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Uint8Array(buf);
}

const auth = (providerId: string) => ({ authorization: `Bearer ${tokenFor(providerId)}` });

describe('uploads', () => {
  let app: App;
  let db: Db;
  let storage: Storage;
  let queue: FakeQueue;

  beforeAll(async () => {
    ({ app, db, storage, queue } = await buildTestApp());
  });
  beforeEach(async () => {
    await resetDb(db);
    queue.transcodes.length = 0;
    queue.failWith = null;
  });
  afterAll(() => app.close());

  async function approvedUser(providerId: string) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    await setAccessStatus(db, { email, status: 'approved' });
    return user;
  }

  const createUpload = (headers: Record<string, string>, body: object) =>
    app.inject({ method: 'POST', url: '/v1/uploads', headers, payload: body });

  const complete = (versionId: string, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: `/v1/uploads/${versionId}/complete`, headers });

  /** Starts an upload as `providerId` (approved) and returns the API's response. */
  async function start(
    providerId: string,
    file: { contentType: string; size: number } = { contentType: 'audio/wav', size: 2044 },
  ): Promise<CreateUploadResponse> {
    await approvedUser(providerId);
    const res = await createUpload(auth(providerId), {
      title: 'Rough idea',
      filename: 'idea.wav',
      contentType: file.contentType,
      sizeBytes: file.size,
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  const put = ({ upload }: CreateUploadResponse, body: Uint8Array) =>
    fetch(upload.url, { method: upload.method, headers: upload.headers, body });

  describe('POST /v1/uploads', () => {
    const valid = {
      title: '  Rough idea ',
      filename: 'idea.wav',
      contentType: 'audio/wav',
      sizeBytes: 2044,
    };

    it('requires a signed-in user', async () => {
      const res = await createUpload({}, valid);
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('turns away users who are not approved', async () => {
      const res = await createUpload(auth('pending'), valid);
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe('ACCOUNT_PENDING');
    });

    it.each([
      ['an unsupported type', { contentType: 'video/mp4' }],
      ['a file over the size limit', { sizeBytes: MAX_UPLOAD_BYTES + 1 }],
      ['an empty file', { sizeBytes: 0 }],
      ['a blank title', { title: '   ' }],
    ])('rejects %s', async (_label, change) => {
      await approvedUser('u1');
      const res = await createUpload(auth('u1'), { ...valid, ...change });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a private track with v1 uploading, and a signed upload URL', async () => {
      const user = await approvedUser('u1');
      const before = Date.now();
      const res = await createUpload(auth('u1'), valid);

      expect(res.statusCode).toBe(201);
      const body: CreateUploadResponse = res.json();
      expect(body.upload).toMatchObject({
        method: 'PUT',
        headers: { 'content-type': 'audio/wav' },
      });
      const expiresIn = Date.parse(body.upload.expiresAt) - before;
      expect(expiresIn).toBeGreaterThan(14 * 60_000);
      expect(expiresIn).toBeLessThanOrEqual(15 * 60_000 + 1000);
      expect(new URL(body.upload.url).pathname).toContain(`originals/${body.versionId}`);

      const found = await findVersion(db, body.versionId);
      expect(found?.track).toMatchObject({
        id: body.trackId,
        ownerId: user.id,
        title: 'Rough idea',
        visibility: 'private',
      });
      expect(found?.version).toMatchObject({
        versionNumber: 1,
        status: 'uploading',
        originalFilename: 'idea.wav',
        originalContentType: 'audio/wav',
        originalSizeBytes: 2044,
      });
      expect(found?.track).toMatchObject({ projectId: null, genre: null });
      expect(found?.version.feedbackPrompt).toBeNull();
    });

    it('saves the genre and feedback prompt, and blank prompts as none', async () => {
      await approvedUser('u1');
      const res = await createUpload(auth('u1'), {
        ...valid,
        genre: 'pop',
        feedbackPrompt: '  Is the vocal too loud? ',
      });
      expect(res.statusCode).toBe(201);
      const found = await findVersion(db, res.json().versionId);
      expect(found?.track.genre).toBe('pop');
      expect(found?.version.feedbackPrompt).toBe('Is the vocal too loud?');

      const blank = await createUpload(auth('u1'), { ...valid, feedbackPrompt: '   ' });
      expect((await findVersion(db, blank.json().versionId))?.version.feedbackPrompt).toBeNull();
    });

    it.each([
      ['an unknown genre', { genre: 'polka-metal' }],
      ['a prompt over 2000 characters', { feedbackPrompt: 'x'.repeat(2001) }],
      ['a project id that is not one', { projectId: 'nope' }],
    ])('rejects %s', async (_label, change) => {
      await approvedUser('u1');
      const res = await createUpload(auth('u1'), { ...valid, ...change });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    describe('into a project', () => {
      it('adds the track to the end of the project', async () => {
        const user = await approvedUser('u1');
        const project = await createProject(db, { ownerId: user.id, title: 'EP' });

        const first = await createUpload(auth('u1'), { ...valid, projectId: project.id });
        const second = await createUpload(auth('u1'), { ...valid, projectId: project.id });

        expect(first.statusCode).toBe(201);
        expect(await findTrack(db, first.json().trackId)).toMatchObject({
          projectId: project.id,
          position: 0,
        });
        expect(await findTrack(db, second.json().trackId)).toMatchObject({
          projectId: project.id,
          position: 1,
        });
      });

      // The privacy promise: picking a public project at upload never makes the track public.
      it('keeps the track private in a public project, even once it is ready', async () => {
        const user = await approvedUser('u1');
        await approvedUser('u2');
        const project = await createProject(db, { ownerId: user.id, title: 'EP' });
        await updateProject(db, project.id, { visibility: 'public' });

        const res = await createUpload(auth('u1'), { ...valid, projectId: project.id });
        const { trackId, versionId }: CreateUploadResponse = res.json();
        await markVersionProcessing(db, versionId);
        await markVersionReady(db, versionId, {
          streamKey: `streams/${versionId}`,
          durationMs: 1000,
          peaks: [0.5],
        });

        const read = (headers: Record<string, string>) =>
          app.inject({ method: 'GET', url: `/v1/tracks/${trackId}`, headers });
        expect((await read(auth('u1'))).json()).toMatchObject({
          visibility: 'private',
          inheritsVisibility: false,
        });
        expect((await read(auth('u2'))).statusCode).toBe(404);
        expect((await read({})).statusCode).toBe(404);
      });

      it('returns 404 for a project that is not theirs or is gone, and creates nothing', async () => {
        const user = await approvedUser('u1');
        const other = await approvedUser('u2');
        const theirs = await createProject(db, { ownerId: other.id, title: 'Theirs' });
        // Public, so being able to see it isn't enough: adding to it takes `manage`.
        await updateProject(db, theirs.id, { visibility: 'public' });
        const gone = await createProject(db, { ownerId: user.id, title: 'Gone' });
        await deleteProject(db, gone.id);

        for (const projectId of [theirs.id, gone.id, crypto.randomUUID()]) {
          const res = await createUpload(auth('u1'), { ...valid, projectId });
          expect(res.statusCode).toBe(404);
          expect(res.json().error.code).toBe('NOT_FOUND');
        }
        const list = await app.inject({ method: 'GET', url: '/v1/tracks', headers: auth('u1') });
        expect(list.json().tracks).toEqual([]);
        expect(await db.select().from(trackVersions)).toEqual([]);
      });

      it('asks anonymous callers to sign in, whatever the project', async () => {
        const res = await createUpload({}, { ...valid, projectId: crypto.randomUUID() });
        expect(res.statusCode).toBe(401);
      });
    });
  });

  describe('POST /v1/tracks/:trackId/versions', () => {
    const file = { filename: 'idea-v2.wav', contentType: 'audio/wav', sizeBytes: 2044 };
    const newVersion = (trackId: string, headers: Record<string, string>, body: object) =>
      app.inject({ method: 'POST', url: `/v1/tracks/${trackId}/versions`, headers, payload: body });

    it('adds the next version, uploading, with its notes, and a signed upload URL', async () => {
      const v1 = await start('u1');
      const res = await newVersion(v1.trackId, auth('u1'), {
        ...file,
        changeNotes: '  Louder vocals, new bridge  ',
        feedbackPrompt: ' Is the bridge too long? ',
      });

      expect(res.statusCode).toBe(201);
      const body: CreateUploadResponse = res.json();
      expect(body.trackId).toBe(v1.trackId);
      expect(body.upload).toMatchObject({
        method: 'PUT',
        headers: { 'content-type': 'audio/wav' },
      });
      expect(new URL(body.upload.url).pathname).toContain(`originals/${body.versionId}`);
      expect((await findVersion(db, body.versionId))?.version).toMatchObject({
        versionNumber: 2,
        status: 'uploading',
        changeNotes: 'Louder vocals, new bridge',
        feedbackPrompt: 'Is the bridge too long?',
        originalFilename: 'idea-v2.wav',
      });
    });

    it('finishes through the same complete call as v1', async () => {
      const v1 = await start('u1');
      const v2: CreateUploadResponse = (await newVersion(v1.trackId, auth('u1'), file)).json();
      expect((await put(v2, wav())).status).toBe(200);

      const res = await complete(v2.versionId, auth('u1'));
      expect(res.json()).toMatchObject({
        versionNumber: 2,
        status: 'processing',
        changeNotes: null,
        feedbackPrompt: null,
      });
      expect(queue.transcodes).toEqual([v2.versionId]);
    });

    it('never reuses a number, and stores blank notes as none', async () => {
      const v1 = await start('u1');
      const v2: CreateUploadResponse = (await newVersion(v1.trackId, auth('u1'), file)).json();
      await markVersionFailed(db, v2.versionId, 'Bad file');

      const v3: CreateUploadResponse = (
        await newVersion(v1.trackId, auth('u1'), { ...file, changeNotes: '   ' })
      ).json();
      expect((await findVersion(db, v3.versionId))?.version).toMatchObject({
        versionNumber: 3,
        changeNotes: null,
        feedbackPrompt: null,
      });
    });

    it('returns 404 to anyone else and for a missing track, and adds nothing', async () => {
      const v1 = await start('u1');
      await approvedUser('u2');

      expect((await newVersion(v1.trackId, auth('u2'), file)).statusCode).toBe(404);
      expect((await newVersion(v1.trackId, {}, file)).statusCode).toBe(404);
      expect((await newVersion(crypto.randomUUID(), auth('u1'), file)).statusCode).toBe(404);
      const v2: CreateUploadResponse = (await newVersion(v1.trackId, auth('u1'), file)).json();
      expect((await findVersion(db, v2.versionId))?.version.versionNumber).toBe(2);
    });

    it.each([
      ['an unsupported type', { contentType: 'video/mp4' }],
      ['a file over the size limit', { sizeBytes: MAX_UPLOAD_BYTES + 1 }],
      ['notes over 2000 characters', { changeNotes: 'x'.repeat(2001) }],
      ['a prompt over 2000 characters', { feedbackPrompt: 'x'.repeat(2001) }],
    ])('rejects %s', async (_label, change) => {
      const v1 = await start('u1');
      const res = await newVersion(v1.trackId, auth('u1'), { ...file, ...change });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /v1/uploads/:versionId/complete', () => {
    it('checks the file, moves the version to processing, and queues it', async () => {
      const started = await start('u1');
      expect((await put(started, wav())).status).toBe(200);

      const res = await complete(started.versionId, auth('u1'));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        id: started.versionId,
        trackId: started.trackId,
        versionNumber: 1,
        changeNotes: null,
        feedbackPrompt: null,
        originalFilename: 'idea.wav',
        status: 'processing',
        failureReason: null,
        durationMs: null,
        waveformPeaks: null,
        createdAt: expect.any(String),
      });
      expect(queue.transcodes).toEqual([started.versionId]);
    });

    it('is safe to repeat', async () => {
      const started = await start('u1');
      await put(started, wav());
      await complete(started.versionId, auth('u1'));

      const again = await complete(started.versionId, auth('u1'));
      expect(again.statusCode).toBe(200);
      expect(again.json().status).toBe('processing');
      // Queued again; BullMQ ignores it while the job (same id) exists.
      expect(queue.transcodes).toEqual([started.versionId, started.versionId]);
    });

    it('returns 409 before the file is uploaded, and leaves the version uploading', async () => {
      const started = await start('u1');
      const res = await complete(started.versionId, auth('u1'));
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('UPLOAD_INCOMPLETE');
      expect((await findVersion(db, started.versionId))?.version.status).toBe('uploading');
      expect(queue.transcodes).toEqual([]);
    });

    it('fails a file that is not audio, whatever it was called', async () => {
      const text = new TextEncoder().encode('<!doctype html><title>not audio</title>');
      const started = await start('u1', { contentType: 'audio/mpeg', size: text.length });
      expect((await put(started, text)).status).toBe(200);

      const res = await complete(started.versionId, auth('u1'));
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        status: 'failed',
        failureReason: FAILURE_REASONS.notAudio,
      });
      expect(queue.transcodes).toEqual([]);

      // Terminal: repeating returns the same failure and still queues nothing.
      expect((await complete(started.versionId, auth('u1'))).json().status).toBe('failed');
      expect(queue.transcodes).toEqual([]);
    });

    it('fails a stored file whose size differs from what was declared', async () => {
      const started = await start('u1');
      const found = await findVersion(db, started.versionId);
      // Storage refuses this through the signed URL, so write it with a URL signed for the
      // wrong size, as a misbehaving provider might store it.
      const body = wav(1500);
      const url = await storage.presignUpload({
        key: found!.version.originalKey,
        contentType: 'audio/wav',
        contentLength: body.length,
        expiresIn: 60,
      });
      await fetch(url, { method: 'PUT', headers: { 'content-type': 'audio/wav' }, body });

      const res = await complete(started.versionId, auth('u1'));
      expect(res.json()).toMatchObject({
        status: 'failed',
        failureReason: FAILURE_REASONS.sizeMismatch,
      });
      expect(queue.transcodes).toEqual([]);
    });

    it('returns a ready version as it is, without queueing', async () => {
      const started = await start('u1');
      await markVersionProcessing(db, started.versionId);
      await markVersionReady(db, started.versionId, {
        streamKey: `streams/${started.versionId}`,
        durationMs: 1000,
        peaks: [0, 1],
      });

      const res = await complete(started.versionId, auth('u1'));
      expect(res.json()).toMatchObject({ status: 'ready', durationMs: 1000 });
      expect(queue.transcodes).toEqual([]);
    });

    it('recovers on retry when queueing fails', async () => {
      const started = await start('u1');
      await put(started, wav());
      queue.failWith = new Error('Redis is down');

      expect((await complete(started.versionId, auth('u1'))).statusCode).toBe(500);
      expect((await findVersion(db, started.versionId))?.version.status).toBe('processing');

      queue.failWith = null;
      const retry = await complete(started.versionId, auth('u1'));
      expect(retry.statusCode).toBe(200);
      expect(queue.transcodes).toEqual([started.versionId]);
    });

    it.each([
      ['anonymous callers', {}],
      ['another user', 'u2'],
    ] as const)('returns 404 to %s', async (_label, who) => {
      const started = await start('u1');
      await put(started, wav());
      let headers = {};
      if (typeof who === 'string') {
        await approvedUser(who);
        headers = auth(who);
      }

      const res = await complete(started.versionId, headers);
      expect(res.statusCode).toBe(404);
      expect((await findVersion(db, started.versionId))?.version.status).toBe('uploading');
      expect(queue.transcodes).toEqual([]);
    });

    it('returns 404 for a version that does not exist, and 400 for a malformed id', async () => {
      await approvedUser('u1');
      expect((await complete(crypto.randomUUID(), auth('u1'))).statusCode).toBe(404);
      expect((await complete('not-a-uuid', auth('u1'))).statusCode).toBe(400);
    });
  });
});
