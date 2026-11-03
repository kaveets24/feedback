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
  setTrackGenre,
  setTrackVisibility,
  tracks,
  updateProject,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { Visibility } from '@feedback/authz';
import type { DiscoverResponse, Genre } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('GET /v1/discover', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  const get = (url: string, providerId?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
    });

  /** An account, approved unless told otherwise, with a profile and handle unless null. */
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

  const original = { filename: 'a.wav', contentType: 'audio/wav', sizeBytes: 10 };

  /** A loose track at the given visibility, with a ready v1 and maybe a genre. */
  async function track(ownerId: string, title: string, visibility: Visibility, genre?: Genre) {
    const { track, version } = await createTrackWithFirstVersion(db, { ownerId, title, original });
    await ready(version.id);
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    if (genre) await setTrackGenre(db, track.id, genre);
    return track;
  }

  const titles = async (url = '/v1/discover', providerId?: string) =>
    (await get(url, providerId)).json<DiscoverResponse>().items.map((item) => item.track.title);

  it('lists public tracks for anyone, newest current version first, with artist and version', async () => {
    const artist = await person('a', 'artist');
    await person('me', 'me');
    const old = await track(artist.id, 'Old', 'public', 'grime');
    await track(artist.id, 'New', 'public');
    await track(artist.id, 'Private', 'private');
    await track(artist.id, 'Unlisted', 'unlisted');

    expect(await titles()).toEqual(['New', 'Old']);
    // The same list signed in.
    expect(await titles('/v1/discover', 'me')).toEqual(['New', 'Old']);

    // A new version brings a track back to the top.
    const v2 = await createNextVersion(db, { trackId: old.id, original });
    await ready(v2!.id);
    const res = await get('/v1/discover');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const [first] = res.json<DiscoverResponse>().items;
    expect(first).toEqual({
      track: { id: old.id, title: 'Old', genre: 'grime' },
      version: {
        id: v2!.id,
        versionNumber: 2,
        durationMs: 3000,
        createdAt: expect.any(String),
      },
      artist: { displayName: 'artist', handle: 'artist', avatar: null },
    });
  });

  it('filters by genre, and rejects an unknown one', async () => {
    const artist = await person('a', 'artist');
    await track(artist.id, 'Garage', 'public', 'uk-garage');
    await track(artist.id, 'Grime', 'public', 'grime');
    await track(artist.id, 'None', 'public');

    expect(await titles('/v1/discover?genre=uk-garage')).toEqual(['Garage']);
    expect(await titles('/v1/discover?genre=electro')).toEqual([]);
    expect((await get('/v1/discover?genre=polka')).statusCode).toBe(400);
  });

  it('judges project tracks by effective visibility', async () => {
    const artist = await person('a', 'artist');
    const ep = await createProject(db, { ownerId: artist.id, title: 'EP' });
    const follows = await track(artist.id, 'Follows project', 'private');
    const hidden = await track(artist.id, 'Hidden override', 'private');
    await moveTrackToProject(db, follows.id, ep.id);
    await moveTrackToProject(db, hidden.id, ep.id);
    await setTrackVisibility(db, hidden.id, 'private');
    expect(await titles()).toEqual([]);

    await updateProject(db, ep.id, { visibility: 'public' });
    // `hidden` overrides the project with private.
    expect(await titles()).toEqual(['Follows project']);

    await setTrackVisibility(db, hidden.id, 'public');
    expect(await titles()).toEqual(['Hidden override', 'Follows project']);

    // Making the project private takes the track that follows it out at once.
    await updateProject(db, ep.id, { visibility: 'private' });
    expect(await titles()).toEqual(['Hidden override']);
  });

  it('leaves out deleted tracks, tracks with nothing ready, and unapproved accounts', async () => {
    const artist = await person('a', 'artist');
    const waiting = await person('w', 'waiting', false);
    const deleted = await track(artist.id, 'Deleted', 'public');
    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, deleted.id));
    const { track: unready } = await createTrackWithFirstVersion(db, {
      ownerId: artist.id,
      title: 'Processing',
      original,
    });
    await setTrackVisibility(db, unready.id, 'public');
    await track(waiting.id, 'Waiting', 'public');

    expect(await titles()).toEqual([]);
  });

  it('shows artists without a handle or profile, with no handle', async () => {
    const noHandle = await person('n', null);
    await track(noHandle.id, 'Anonymous-ish', 'public');

    const [item] = (await get('/v1/discover')).json<DiscoverResponse>().items;
    expect(item?.artist).toEqual({ displayName: null, handle: null, avatar: null });
  });

  it('pages by cursor', async () => {
    const artist = await person('a', 'artist');
    for (const title of ['One', 'Two', 'Three']) await track(artist.id, title, 'public');

    const first = (await get('/v1/discover?limit=2')).json<DiscoverResponse>();
    expect(first.items.map((item) => item.track.title)).toEqual(['Three', 'Two']);
    expect(first.nextCursor).not.toBeNull();
    const second = (
      await get(`/v1/discover?limit=2&cursor=${first.nextCursor}`)
    ).json<DiscoverResponse>();
    expect(second.items.map((item) => item.track.title)).toEqual(['One']);
    expect(second.nextCursor).toBeNull();
    expect((await get('/v1/discover?cursor=nope')).statusCode).toBe(400);
  });
});
