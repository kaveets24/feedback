import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createNextVersion,
  createProject,
  createTrackWithFirstVersion,
  markVersionProcessing,
  markVersionReady,
  moveTrackToProject,
  profiles,
  setAccessStatus,
  setTrackVisibility,
  tracks,
  updateProject,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { Visibility } from '@feedback/authz';
import type { FeedResponse, FollowingResponse, PublicProfileResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('follows and the feed', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  const call = (method: 'GET' | 'PUT' | 'DELETE', url: string, providerId?: string) =>
    app.inject({
      method,
      url,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
    });

  /** An approved account, with a profile and handle unless `handle` is null. */
  async function person(providerId: string, handle: string | null, approved = true) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    if (approved) await setAccessStatus(db, { email, status: 'approved' });
    if (handle) await db.insert(profiles).values({ userId: user.id, handle, displayName: handle });
    return user;
  }

  const ready = async (versionId: string) => {
    await markVersionProcessing(db, versionId);
    await markVersionReady(db, versionId, {
      streamKey: `streams/${versionId}`,
      durationMs: 3000,
      peaks: [0, 1],
    });
  };

  /** A loose track at the given visibility, with a ready v1. */
  async function track(ownerId: string, title: string, visibility: Visibility) {
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId,
      title,
      original: { filename: 'a.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
    await ready(version.id);
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    return track;
  }

  const feed = async (providerId: string) =>
    (await call('GET', '/v1/feed', providerId))
      .json<FeedResponse>()
      .items.map((item) => `${item.artist.handle}: ${item.track.title} v${item.versionNumber}`);

  describe('following', () => {
    it('follows and unfollows by handle, repeats changing nothing, and shows on the profile', async () => {
      await person('me', 'me');
      await person('a', 'artist');
      const following = async () =>
        (await call('GET', '/v1/profiles/artist', 'me')).json<PublicProfileResponse>().following;

      expect(await following()).toBe(false);
      for (let i = 0; i < 2; i++) {
        expect((await call('PUT', '/v1/profiles/Artist/follow', 'me')).statusCode).toBe(204);
      }
      expect(await following()).toBe(true);
      // Signed out, nobody follows anyone.
      expect(
        (await call('GET', '/v1/profiles/artist')).json<PublicProfileResponse>().following,
      ).toBe(false);

      for (let i = 0; i < 2; i++) {
        expect((await call('DELETE', '/v1/profiles/artist/follow', 'me')).statusCode).toBe(204);
      }
      expect(await following()).toBe(false);
    });

    it('needs a signed-in, approved account, someone else, and a public page', async () => {
      await person('me', 'me');
      await person('p', 'pending', false);
      await person('w', 'waiting', false);
      await person('a', 'artist');

      expect((await call('PUT', '/v1/profiles/artist/follow')).statusCode).toBe(401);
      expect((await call('PUT', '/v1/profiles/artist/follow', 'p')).statusCode).toBe(403);
      const self = await call('PUT', '/v1/profiles/me/follow', 'me');
      expect(self.statusCode).toBe(400);
      expect(self.json()).toMatchObject({ error: { code: 'CANNOT_FOLLOW_SELF' } });
      for (const handle of ['nobody', 'waiting']) {
        expect((await call('PUT', `/v1/profiles/${handle}/follow`, 'me')).statusCode).toBe(404);
        expect((await call('DELETE', `/v1/profiles/${handle}/follow`, 'me')).statusCode).toBe(404);
      }
    });

    it('lists who you follow, most recent first, in pages, leaving out anyone without a page', async () => {
      await person('me', 'me');
      for (const handle of ['one', 'two', 'three']) {
        await person(handle, handle);
        await call('PUT', `/v1/profiles/${handle}/follow`, 'me');
      }
      // Clearing a handle takes them out of the list until they set one.
      const gone = await person('gone', 'gone');
      await call('PUT', '/v1/profiles/gone/follow', 'me');
      await db.update(profiles).set({ handle: null }).where(eq(profiles.userId, gone.id));

      const first = (await call('GET', '/v1/me/following?limit=2', 'me')).json<FollowingResponse>();
      expect(first.artists).toEqual([
        { handle: 'three', displayName: 'three', avatar: null },
        { handle: 'two', displayName: 'two', avatar: null },
      ]);
      const next = await call('GET', `/v1/me/following?limit=2&cursor=${first.nextCursor}`, 'me');
      expect(next.json<FollowingResponse>()).toEqual({
        artists: [{ handle: 'one', displayName: 'one', avatar: null }],
        nextCursor: null,
      });
      expect((await call('GET', '/v1/me/following')).statusCode).toBe(401);
    });
  });

  describe('GET /v1/feed', () => {
    it('shows only public work by the people you follow, newest first', async () => {
      await person('me', 'me');
      const followed = await person('a', 'artist');
      const stranger = await person('s', 'stranger');
      await call('PUT', '/v1/profiles/artist/follow', 'me');

      await track(followed.id, 'Private', 'private');
      await track(followed.id, 'Unlisted', 'unlisted');
      const song = await track(followed.id, 'Song', 'public');
      await track(stranger.id, 'Not followed', 'public');
      // A second version, still processing, then ready.
      const v2 = await createNextVersion(db, {
        trackId: song.id,
        original: { filename: 'b.wav', contentType: 'audio/wav', sizeBytes: 10 },
      });
      expect(await feed('me')).toEqual(['artist: Song v1']);
      await ready(v2!.id);

      expect(await feed('me')).toEqual(['artist: Song v2', 'artist: Song v1']);
      const [item] = (await call('GET', '/v1/feed', 'me')).json<FeedResponse>().items;
      expect(item).toMatchObject({
        versionId: v2!.id,
        durationMs: 3000,
        track: { id: song.id, title: 'Song' },
        artist: { handle: 'artist', displayName: 'artist', avatar: null },
      });
    });

    it('judges project tracks by their effective visibility, and leaves out deleted tracks', async () => {
      await person('me', 'me');
      const followed = await person('a', 'artist');
      await call('PUT', '/v1/profiles/artist/follow', 'me');

      const ep = await createProject(db, { ownerId: followed.id, title: 'EP' });
      const following = await track(followed.id, 'Follows the public project', 'private');
      const hidden = await track(followed.id, 'Private in the public project', 'private');
      await moveTrackToProject(db, following.id, ep.id);
      await moveTrackToProject(db, hidden.id, ep.id);
      await updateProject(db, ep.id, { visibility: 'public' });
      await setTrackVisibility(db, hidden.id, 'private');
      const deleted = await track(followed.id, 'Deleted', 'public');
      await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, deleted.id));

      expect(await feed('me')).toEqual(['artist: Follows the public project v1']);
    });

    it('drops someone who clears their handle or loses approval, and anyone you unfollow', async () => {
      await person('me', 'me');
      const a = await person('a', 'artist');
      const b = await person('b', 'band');
      for (const handle of ['artist', 'band'])
        await call('PUT', `/v1/profiles/${handle}/follow`, 'me');
      await track(a.id, 'A song', 'public');
      await track(b.id, 'B song', 'public');
      expect(await feed('me')).toEqual(['band: B song v1', 'artist: A song v1']);

      await db.update(profiles).set({ handle: null }).where(eq(profiles.userId, a.id));
      expect(await feed('me')).toEqual(['band: B song v1']);
      await setAccessStatus(db, { email: b.email, status: 'rejected' });
      expect(await feed('me')).toEqual([]);

      await db.update(profiles).set({ handle: 'artist' }).where(eq(profiles.userId, a.id));
      expect(await feed('me')).toEqual(['artist: A song v1']);
      await call('DELETE', '/v1/profiles/artist/follow', 'me');
      expect(await feed('me')).toEqual([]);
    });

    it('pages with a cursor, and needs you signed in', async () => {
      await person('me', 'me');
      const a = await person('a', 'artist');
      await call('PUT', '/v1/profiles/artist/follow', 'me');
      for (const title of ['One', 'Two', 'Three']) await track(a.id, title, 'public');

      const first = (await call('GET', '/v1/feed?limit=2', 'me')).json<FeedResponse>();
      expect(first.items.map((item) => item.track.title)).toEqual(['Three', 'Two']);
      const next = await call('GET', `/v1/feed?limit=2&cursor=${first.nextCursor}`, 'me');
      expect(next.json<FeedResponse>()).toMatchObject({
        items: [expect.objectContaining({ track: expect.objectContaining({ title: 'One' }) })],
        nextCursor: null,
      });
      expect((await call('GET', '/v1/feed')).statusCode).toBe(401);
    });
  });
});
