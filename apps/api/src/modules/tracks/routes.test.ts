import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackWithFirstVersion,
  markVersionFailed,
  markVersionProcessing,
  markVersionReady,
  setAccessStatus,
  tracks,
  trackVersions,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { CreateShareLinkResponse, TrackListResponse, TrackResponse } from '@feedback/shared';
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
      const second = await newTrack(me.id, 'Second');
      await markVersionProcessing(db, second.version.id);
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
        projectId: null,
        visibility: 'private',
        inheritsVisibility: false,
        genre: null,
        createdAt: first.track.createdAt.toISOString(),
        currentVersionId: null,
        latestVersion: {
          id: first.version.id,
          versionNumber: 1,
          status: 'failed',
          durationMs: null,
          createdAt: first.version.createdAt.toISOString(),
        },
      });
    });

    it('pages with nextCursor until it is null', async () => {
      const me = await approvedUser('u1');
      for (const title of ['1', '2', '3', '4', '5']) {
        await markVersionProcessing(db, (await newTrack(me.id, title)).version.id);
      }

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

    it('leaves out a track whose upload never finished, though its page still loads', async () => {
      const me = await approvedUser('u1');
      const { track } = await newTrack(me.id, 'Unfinished');

      expect((await get('/v1/tracks', 'u1')).json<TrackListResponse>().tracks).toEqual([]);
      expect((await get(`/v1/tracks/${track.id}`, 'u1')).statusCode).toBe(200);
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
        projectId: null,
        notes: null,
        currentVersionId: null,
        canManage: true,
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

  describe('PATCH /v1/tracks/:trackId', () => {
    const patch = (url: string, payload: object, providerId?: string) =>
      app.inject({
        method: 'PATCH',
        url,
        headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
        payload,
      });

    it('lets the owner rename a track, which every viewer sees', async () => {
      const me = await approvedUser('u1');
      const { track, version } = await newTrack(me.id, 'Idea');
      await markVersionProcessing(db, version.id);
      await markVersionReady(db, version.id, {
        streamKey: `streams/${version.id}`,
        durationMs: 3000,
        peaks: [0, 0.5, 1],
      });
      const url = `/v1/tracks/${track.id}`;
      await patch(url, { visibility: 'public', genre: 'grime' }, 'u1');

      const res = await patch(url, { title: '  Night drive  ' }, 'u1');
      expect(res.statusCode).toBe(200);
      // Nothing else changes with it.
      expect(res.json<TrackResponse>()).toMatchObject({
        title: 'Night drive',
        genre: 'grime',
        visibility: 'public',
      });
      expect((await get(url)).json<TrackResponse>().title).toBe('Night drive');
      const [listed] = (await get('/v1/tracks', 'u1')).json<TrackListResponse>().tracks;
      expect(listed?.title).toBe('Night drive');
    });

    it('is a 404 for anyone but the owner, and rejects blank and overlong titles', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const { track } = await newTrack(me.id, 'Idea');
      const url = `/v1/tracks/${track.id}`;
      await patch(url, { visibility: 'public' }, 'u1');

      expect((await patch(url, { title: 'Mine now' }, 'u2')).statusCode).toBe(404);
      expect((await patch(url, { title: 'Mine now' })).statusCode).toBe(404);
      expect((await patch(url, { title: '   ' }, 'u1')).statusCode).toBe(400);
      expect((await patch(url, { title: 'x'.repeat(201) }, 'u1')).statusCode).toBe(400);
      expect((await get(url, 'u1')).json<TrackResponse>().title).toBe('Idea');
    });

    it('saves no new title when a visibility change alongside it is refused', async () => {
      const me = await approvedUser('u1');
      const { track } = await newTrack(me.id, 'Idea');
      const url = `/v1/tracks/${track.id}`;

      // A loose track has no project visibility to follow.
      const refused = await patch(url, { visibility: null, title: 'Night drive' }, 'u1');
      expect(refused.statusCode).toBe(409);
      expect((await get(url, 'u1')).json<TrackResponse>().title).toBe('Idea');
    });

    it('lets the owner set and clear the genre, which every viewer sees', async () => {
      const me = await approvedUser('u1');
      const { track, version } = await newTrack(me.id, 'Idea');
      await markVersionProcessing(db, version.id);
      await markVersionReady(db, version.id, {
        streamKey: `streams/${version.id}`,
        durationMs: 3000,
        peaks: [0, 0.5, 1],
      });
      const url = `/v1/tracks/${track.id}`;

      const res = await patch(url, { genre: 'uk-garage' }, 'u1');
      expect(res.statusCode).toBe(200);
      expect(res.json<TrackResponse>()).toMatchObject({
        genre: 'uk-garage',
        visibility: 'private',
      });
      const [listed] = (await get('/v1/tracks', 'u1')).json<TrackListResponse>().tracks;
      expect(listed?.genre).toBe('uk-garage');

      // Listeners see it once the track is public.
      await patch(url, { visibility: 'public' }, 'u1');
      expect((await get(url)).json<TrackResponse>()).toMatchObject({ genre: 'uk-garage' });

      const cleared = await patch(url, { genre: null }, 'u1');
      expect(cleared.json<TrackResponse>()).toMatchObject({ genre: null, visibility: 'public' });
    });

    it('changes visibility and genre together, and saves neither when one is refused', async () => {
      const me = await approvedUser('u1');
      const { track } = await newTrack(me.id, 'Idea');
      const url = `/v1/tracks/${track.id}`;

      const both = await patch(url, { visibility: 'unlisted', genre: 'grime' }, 'u1');
      expect(both.json<TrackResponse>()).toMatchObject({ visibility: 'unlisted', genre: 'grime' });

      // A loose track has no project visibility to follow.
      const refused = await patch(url, { visibility: null, genre: 'bass' }, 'u1');
      expect(refused.statusCode).toBe(409);
      expect((await get(url, 'u1')).json<TrackResponse>().genre).toBe('grime');
    });

    it('is a 404 for anyone but the owner, and rejects unknown genres and empty changes', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const { track } = await newTrack(me.id, 'Idea');
      const url = `/v1/tracks/${track.id}`;
      await patch(url, { visibility: 'public' }, 'u1');

      expect((await patch(url, { genre: 'electro' }, 'u2')).statusCode).toBe(404);
      expect((await patch(url, { genre: 'electro' })).statusCode).toBe(404);
      expect((await patch(url, { genre: 'polka' }, 'u1')).statusCode).toBe(400);
      expect((await patch(url, {}, 'u1')).statusCode).toBe(400);
      expect((await get(url, 'u1')).json<TrackResponse>().genre).toBeNull();
    });
  });

  describe('DELETE /v1/tracks/:trackId', () => {
    const send = (
      method: 'DELETE' | 'PATCH' | 'POST',
      url: string,
      { providerId, token, payload }: { providerId?: string; token?: string; payload?: object },
    ) =>
      app.inject({
        method,
        url,
        headers: {
          ...(providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {}),
          ...(token ? { 'x-share-token': token } : {}),
        },
        ...(payload ? { payload } : {}),
      });

    /** A track anyone with a link can hear, and a live link to it. */
    async function sharedTrack(ownerProviderId: string, ownerId: string) {
      const { track } = await newTrack(ownerId, 'Idea');
      const visibility = { visibility: 'unlisted' };
      await send('PATCH', `/v1/tracks/${track.id}`, {
        providerId: ownerProviderId,
        payload: visibility,
      });
      const res = await send('POST', `/v1/tracks/${track.id}/share-links`, {
        providerId: ownerProviderId,
        payload: {},
      });
      expect(res.statusCode).toBe(201);
      return { track, token: res.json<CreateShareLinkResponse>().token };
    }

    it('lets the owner delete it, which turns its links off', async () => {
      const me = await approvedUser('u1');
      const { track, token } = await sharedTrack('u1', me.id);
      const current = () =>
        app.inject({
          method: 'GET',
          url: '/v1/share-links/current',
          headers: { 'x-share-token': token },
        });
      expect((await current()).statusCode).toBe(200);

      const res = await send('DELETE', `/v1/tracks/${track.id}`, { providerId: 'u1' });
      expect(res.statusCode).toBe(204);
      expect((await get(`/v1/tracks/${track.id}`, 'u1')).statusCode).toBe(404);
      expect((await get('/v1/tracks', 'u1')).json<TrackListResponse>().tracks).toEqual([]);
      expect((await current()).statusCode).toBe(404);
      // Deleting again finds nothing.
      expect(
        (await send('DELETE', `/v1/tracks/${track.id}`, { providerId: 'u1' })).statusCode,
      ).toBe(404);
    });

    it('is a 404 for anyone but the owner, link or not, and deletes nothing', async () => {
      const me = await approvedUser('u1');
      await approvedUser('u2');
      const { track, token } = await sharedTrack('u1', me.id);
      const url = `/v1/tracks/${track.id}`;

      expect((await send('DELETE', url, { providerId: 'u2' })).statusCode).toBe(404);
      expect((await send('DELETE', url, { providerId: 'u2', token })).statusCode).toBe(404);
      expect((await send('DELETE', url, {})).statusCode).toBe(404);
      expect((await send('DELETE', url, { token })).statusCode).toBe(404);
      expect((await get(url, 'u1')).statusCode).toBe(200);
    });

    it('is a 404 for a missing track, and rejects a bad id', async () => {
      await approvedUser('u1');
      const missing = `/v1/tracks/${crypto.randomUUID()}`;
      expect((await send('DELETE', missing, { providerId: 'u1' })).statusCode).toBe(404);
      expect((await send('DELETE', '/v1/tracks/nope', { providerId: 'u1' })).statusCode).toBe(400);
    });
  });
});
