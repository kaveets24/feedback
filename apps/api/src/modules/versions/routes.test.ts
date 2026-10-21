import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackWithFirstVersion,
  markVersionProcessing,
  markVersionReady,
  setAccessStatus,
  tracks,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import type { Storage } from '@feedback/storage';
import { eq } from 'drizzle-orm';
import { resetDb } from '@feedback/db/testing';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('version routes', () => {
  let app: App;
  let db: Db;
  let storage: Storage;

  beforeAll(async () => {
    ({ app, db, storage } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  async function approvedUser(providerId: string) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    await setAccessStatus(db, { email, status: 'approved' });
    return user;
  }

  async function ownedVersion(providerId: string) {
    const owner = await approvedUser(providerId);
    return createTrackWithFirstVersion(db, {
      ownerId: owner.id,
      title: 'Idea',
      original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
  }

  /** Moves a version to `ready` the way the worker does, with a real stream object stored. */
  async function readyVersion(versionId: string) {
    const streamKey = `streams/${versionId}`;
    const dir = await mkdtemp(join(tmpdir(), 'versions-test-'));
    try {
      await writeFile(join(dir, 'stream'), 'fake aac');
      await storage.upload(streamKey, join(dir, 'stream'), 'audio/mp4');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
    await markVersionProcessing(db, versionId);
    await markVersionReady(db, versionId, { streamKey, durationMs: 3000, peaks: [0, 0.5, 1] });
  }

  const get = (versionId: string, providerId?: string, suffix = '') =>
    app.inject({
      method: 'GET',
      url: `/v1/versions/${versionId}${suffix}`,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
    });

  it("returns the owner's version and its status", async () => {
    const { track, version } = await ownedVersion('u1');
    const res = await get(version.id, 'u1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: version.id,
      trackId: track.id,
      versionNumber: 1,
      changeNotes: null,
      feedbackPrompt: null,
      originalFilename: 'idea.wav',
      status: 'uploading',
      failureReason: null,
      durationMs: null,
      waveformPeaks: null,
      createdAt: version.createdAt.toISOString(),
    });
  });

  it('includes the duration and peaks once ready', async () => {
    const { version } = await ownedVersion('u1');
    await readyVersion(version.id);
    expect((await get(version.id, 'u1')).json()).toMatchObject({
      status: 'ready',
      durationMs: 3000,
      waveformPeaks: [0, 0.5, 1],
    });
  });

  it('returns 404 to anyone else, as if it did not exist', async () => {
    const { version } = await ownedVersion('u1');
    await approvedUser('u2');
    expect((await get(version.id, 'u2')).statusCode).toBe(404);
    expect((await get(version.id)).statusCode).toBe(404);
    expect((await get(crypto.randomUUID(), 'u1')).statusCode).toBe(404);
  });

  describe('PATCH /v1/versions/:versionId', () => {
    const patch = (versionId: string, payload: object, providerId?: string) =>
      app.inject({
        method: 'PATCH',
        url: `/v1/versions/${versionId}`,
        headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
        payload,
      });

    it('sets, trims, and clears the notes, even on a ready version', async () => {
      const { version } = await ownedVersion('u1');
      await readyVersion(version.id);

      const set = await patch(version.id, { changeNotes: '  Tighter drums ' }, 'u1');
      expect(set.statusCode).toBe(200);
      expect(set.json()).toMatchObject({ changeNotes: 'Tighter drums', status: 'ready' });

      expect((await patch(version.id, { changeNotes: '  ' }, 'u1')).json().changeNotes).toBeNull();
      await patch(version.id, { changeNotes: 'Again' }, 'u1');
      expect((await patch(version.id, { changeNotes: null }, 'u1')).json().changeNotes).toBeNull();
    });

    it('sets what the artist wants feedback on, apart from the notes', async () => {
      const { version } = await ownedVersion('u1');
      await readyVersion(version.id);
      await patch(version.id, { changeNotes: 'Tighter drums' }, 'u1');

      const set = await patch(version.id, { feedbackPrompt: ' Is the vocal too loud? ' }, 'u1');
      expect(set.json()).toMatchObject({
        changeNotes: 'Tighter drums',
        feedbackPrompt: 'Is the vocal too loud?',
      });
      const cleared = await patch(version.id, { feedbackPrompt: '' }, 'u1');
      expect(cleared.json()).toMatchObject({ changeNotes: 'Tighter drums', feedbackPrompt: null });
      expect((await patch(version.id, {}, 'u1')).statusCode).toBe(400);
    });

    it('returns 404 to anyone else and leaves the notes alone', async () => {
      const { version } = await ownedVersion('u1');
      await approvedUser('u2');
      await patch(version.id, { changeNotes: 'Mine' }, 'u1');

      expect((await patch(version.id, { changeNotes: 'Theirs' }, 'u2')).statusCode).toBe(404);
      expect((await patch(version.id, { changeNotes: 'Theirs' })).statusCode).toBe(404);
      expect((await get(version.id, 'u1')).json().changeNotes).toBe('Mine');
    });

    it('rejects notes over 2000 characters or a missing field', async () => {
      const { version } = await ownedVersion('u1');
      expect((await patch(version.id, { changeNotes: 'x'.repeat(2001) }, 'u1')).statusCode).toBe(
        400,
      );
      expect((await patch(version.id, {}, 'u1')).statusCode).toBe(400);
    });
  });

  describe('GET /v1/versions/:versionId/stream', () => {
    const stream = (versionId: string, providerId?: string) =>
      get(versionId, providerId, '/stream');

    it('gives the owner a short-lived URL that serves the stream, and no-store', async () => {
      const { version } = await ownedVersion('u1');
      await readyVersion(version.id);

      const before = Date.now();
      const res = await stream(version.id, 'u1');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');

      const { url, expiresAt } = res.json<{ url: string; expiresAt: string }>();
      const lifetime = Date.parse(expiresAt) - before;
      expect(lifetime).toBeGreaterThan(9 * 60_000);
      expect(lifetime).toBeLessThanOrEqual(10 * 60_000 + 1000);
      const audio = await fetch(url);
      expect(audio.status).toBe(200);
      expect(await audio.text()).toBe('fake aac');
    });

    it('returns 409 to the owner while the version is not ready', async () => {
      const { version } = await ownedVersion('u1');
      const res = await stream(version.id, 'u1');
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: 'VERSION_NOT_READY' } });
    });

    it('returns 404 to anyone else, ready or not, and for deleted tracks', async () => {
      const { track, version } = await ownedVersion('u1');
      await approvedUser('u2');
      for (const ready of [false, true]) {
        if (ready) await readyVersion(version.id);
        expect((await stream(version.id, 'u2')).statusCode).toBe(404);
        expect((await stream(version.id)).statusCode).toBe(404);
      }
      await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, track.id));
      expect((await stream(version.id, 'u1')).statusCode).toBe(404);
    });
  });
});
