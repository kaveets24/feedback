import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackWithFirstVersion,
  markVersionFailed,
  setAccessStatus,
  tracks,
  trackVersions,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { TrackListResponse, TrackResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('track routes', () => {
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

  async function newTrack(ownerId: string, title: string) {
    return createTrackWithFirstVersion(db, {
      ownerId,
      title,
      original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
  }

  const get = (url: string, providerId?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
    });

  describe('GET /v1/tracks', () => {
    it("lists only the signed-in user's tracks, newest first, with each newest version", async () => {
      const me = await approvedUser('u1');
      const other = await approvedUser('u2');
      const first = await newTrack(me.id, 'First');
      await newTrack(me.id, 'Second');
      await newTrack(other.id, 'Not mine');
      await markVersionFailed(db, first.version.id, 'Bad file');

      const res = await get('/v1/tracks', 'u1');
      expect(res.statusCode).toBe(200);
      const body = res.json<TrackListResponse>();
      expect(body.nextCursor).toBeNull();
      expect(body.tracks.map((t) => t.title)).toEqual(['Second', 'First']);
      expect(body.tracks[1]).toEqual({
        id: first.track.id,
        title: 'First',
        visibility: 'private',
        createdAt: first.track.createdAt.toISOString(),
        currentVersionId: null,
        latestVersion: {
          id: first.version.id,
          versionNumber: 1,
          status: 'failed',
          durationMs: null,
        },
      });
    });

    it('pages with nextCursor until it is null', async () => {
      const me = await approvedUser('u1');
      for (const title of ['1', '2', '3', '4', '5']) await newTrack(me.id, title);

      const titles: string[] = [];
      let url = '/v1/tracks?limit=2';
      for (let pages = 1; ; pages++) {
        const body = (await get(url, 'u1')).json<TrackListResponse>();
        titles.push(...body.tracks.map((t) => t.title));
        if (!body.nextCursor) {
          expect(pages).toBe(3);
          break;
        }
        url = `/v1/tracks?limit=2&cursor=${body.nextCursor}`;
      }
      expect(titles).toEqual(['5', '4', '3', '2', '1']);
    });

    it('rejects a bad cursor or limit', async () => {
      await approvedUser('u1');
      for (const query of ['cursor=nope', 'limit=0', 'limit=101']) {
        expect((await get(`/v1/tracks?${query}`, 'u1')).statusCode).toBe(400);
      }
    });

    it('requires signing in', async () => {
      const res = await get('/v1/tracks');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /v1/tracks/:trackId', () => {
    it('returns the track with its versions, newest first', async () => {
      const me = await approvedUser('u1');
      const { track, version } = await newTrack(me.id, 'Idea');
      await db.insert(trackVersions).values({
        trackId: track.id,
        versionNumber: 2,
        originalKey: 'originals/v2',
        originalFilename: 'idea-v2.wav',
        originalContentType: 'audio/wav',
        originalSizeBytes: 10,
      });

      const res = await get(`/v1/tracks/${track.id}`, 'u1');
      expect(res.statusCode).toBe(200);
      const body = res.json<TrackResponse>();
      expect(body).toMatchObject({
        id: track.id,
        title: 'Idea',
        notes: null,
        currentVersionId: null,
      });
      expect(body.versions.map((v) => v.versionNumber)).toEqual([2, 1]);
      expect(body.versions[1]).toMatchObject({ id: version.id, status: 'uploading' });
    });

    it('returns 404 to anyone else, and for missing or deleted tracks', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const { track } = await newTrack(me.id, 'Idea');

      expect((await get(`/v1/tracks/${track.id}`, 'u2')).statusCode).toBe(404);
      expect((await get(`/v1/tracks/${track.id}`)).statusCode).toBe(404);
      expect((await get(`/v1/tracks/${crypto.randomUUID()}`, 'u1')).statusCode).toBe(404);

      await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, track.id));
      expect((await get(`/v1/tracks/${track.id}`, 'u1')).statusCode).toBe(404);
    });
  });
});
