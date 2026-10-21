import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createProject,
  createTrackWithFirstVersion,
  deleteProject,
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
import type { ProjectListResponse, TrackListResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('public profiles', () => {
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

  /** An account with a profile and the given handle, approved unless said otherwise. */
  async function artist(providerId: string, handle: string, approved = true) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    if (approved) await setAccessStatus(db, { email, status: 'approved' });
    await db.insert(profiles).values({
      userId: user.id,
      handle,
      displayName: 'Night Owl',
      bio: 'Bedroom pop.',
      city: 'miami',
    });
    return user;
  }

  /** A loose track at the given visibility, with a ready v1 unless `ready` is false. */
  async function track(ownerId: string, title: string, visibility: Visibility, ready = true) {
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId,
      title,
      original: { filename: 'a.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
    if (ready) {
      await markVersionProcessing(db, version.id);
      await markVersionReady(db, version.id, {
        streamKey: `streams/${version.id}`,
        durationMs: 3000,
        peaks: [0, 1],
      });
    }
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    return track;
  }

  const titles = async (url: string, providerId?: string) =>
    (await get(url, providerId)).json<TrackListResponse>().tracks.map((t) => t.title);

  describe('GET /v1/profiles/:handle', () => {
    it('shows anyone the public fields, by handle in any case', async () => {
      await artist('u1', 'night_owl');
      for (const url of ['/v1/profiles/night_owl', '/v1/profiles/Night_Owl']) {
        const res = await get(url);
        expect(res.statusCode).toBe(200);
        // Never the account's id or email.
        expect(res.json()).toEqual({
          handle: 'night_owl',
          displayName: 'Night Owl',
          bio: 'Bedroom pop.',
          city: 'miami',
          avatar: null,
          following: false,
        });
      }
    });

    it('is a 404 for an unknown handle, and for an account that isn’t approved', async () => {
      await artist('u1', 'waiting', false);
      const rejected = await artist('u2', 'turned_away');
      await setAccessStatus(db, { email: rejected.email, status: 'rejected' });

      for (const handle of ['nobody', 'waiting', 'turned_away']) {
        expect((await get(`/v1/profiles/${handle}`)).statusCode).toBe(404);
        expect((await get(`/v1/profiles/${handle}/tracks`)).statusCode).toBe(404);
        expect((await get(`/v1/profiles/${handle}/projects`)).statusCode).toBe(404);
      }
    });
  });

  describe('GET /v1/profiles/:handle/tracks', () => {
    it('lists only public tracks with something to play, newest first', async () => {
      const me = await artist('u1', 'night_owl');
      await track(me.id, 'Private', 'private');
      await track(me.id, 'Unlisted', 'unlisted');
      await track(me.id, 'Public, still processing', 'public', false);
      await track(me.id, 'Public one', 'public');
      await track(me.id, 'Public two', 'public');
      const deleted = await track(me.id, 'Public, deleted', 'public');
      await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, deleted.id));

      expect(await titles('/v1/profiles/night_owl/tracks')).toEqual(['Public two', 'Public one']);
    });

    it('judges project tracks by their effective visibility', async () => {
      const me = await artist('u1', 'night_owl');
      const open = await createProject(db, { ownerId: me.id, title: 'Open EP' });
      const following = await track(me.id, 'Follows the public project', 'private');
      const hidden = await track(me.id, 'Private in the public project', 'private');
      await moveTrackToProject(db, following.id, open.id);
      await moveTrackToProject(db, hidden.id, open.id);
      await updateProject(db, open.id, { visibility: 'public' });
      await setTrackVisibility(db, hidden.id, 'private');

      const linkOnly = await createProject(db, { ownerId: me.id, title: 'Link-only EP' });
      await updateProject(db, linkOnly.id, { visibility: 'unlisted' });
      const widened = await track(me.id, 'Public in a link-only project', 'private');
      await moveTrackToProject(db, widened.id, linkOnly.id);
      await setTrackVisibility(db, widened.id, 'public');

      const res = await get('/v1/profiles/night_owl/tracks');
      const list = res.json<TrackListResponse>().tracks;
      expect(list.map((t) => [t.title, t.projectId])).toEqual([
        // The link-only project stays unnamed.
        ['Public in a link-only project', null],
        ['Follows the public project', open.id],
      ]);
      expect(list.every((t) => t.visibility === 'public')).toBe(true);
    });

    it('shows its owner the same list as everyone else', async () => {
      const me = await artist('u1', 'night_owl');
      await track(me.id, 'Private', 'private');
      await track(me.id, 'Public', 'public');
      expect(await titles('/v1/profiles/night_owl/tracks', 'u1')).toEqual(['Public']);
    });

    it('pages with a cursor', async () => {
      const me = await artist('u1', 'night_owl');
      for (const title of ['One', 'Two', 'Three']) await track(me.id, title, 'public');

      const first = (await get('/v1/profiles/night_owl/tracks?limit=2')).json<TrackListResponse>();
      expect(first.tracks.map((t) => t.title)).toEqual(['Three', 'Two']);
      const next = await get(`/v1/profiles/night_owl/tracks?limit=2&cursor=${first.nextCursor}`);
      expect(next.json<TrackListResponse>()).toMatchObject({
        tracks: [expect.objectContaining({ title: 'One' })],
        nextCursor: null,
      });
    });
  });

  describe('GET /v1/profiles/:handle/projects', () => {
    it('lists only public, live projects, newest first', async () => {
      const me = await artist('u1', 'night_owl');
      await createProject(db, { ownerId: me.id, title: 'Private' });
      for (const [title, visibility] of [
        ['Unlisted', 'unlisted'],
        ['Public one', 'public'],
        ['Public two', 'public'],
        ['Public, deleted', 'public'],
      ] as const) {
        const project = await createProject(db, { ownerId: me.id, title });
        await updateProject(db, project.id, { visibility });
        if (title === 'Public, deleted') await deleteProject(db, project.id);
      }

      const res = await get('/v1/profiles/night_owl/projects');
      expect(res.statusCode).toBe(200);
      const body = res.json<ProjectListResponse>();
      expect(body.projects.map((p) => p.title)).toEqual(['Public two', 'Public one']);
      expect(body.nextCursor).toBeNull();
    });
  });
});
