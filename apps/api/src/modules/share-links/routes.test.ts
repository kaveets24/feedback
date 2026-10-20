import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Visibility } from '@feedback/authz';
import {
  createNextVersion,
  createProject,
  createTrackWithFirstVersion,
  deleteProject,
  markVersionProcessing,
  markVersionReady,
  moveTrackToProject,
  setAccessStatus,
  setTrackVisibility,
  shareLinks,
  updateProject,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import {
  SHARE_TOKEN_HEADER,
  type CreateShareLinkResponse,
  type ProjectTracksResponse,
  type ShareLinkListResponse,
  type TrackResponse,
} from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';
import { hashShareToken } from './repo.ts';

describe('share links', () => {
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

  const original = { filename: 'take-3.wav', contentType: 'audio/wav', sizeBytes: 10 };

  /** A track with a ready v1 and a processing v2. */
  async function newTrack(ownerId: string, visibility: Visibility, title = 'Night drive') {
    const { track, version: v1 } = await createTrackWithFirstVersion(db, {
      ownerId,
      title,
      original,
    });
    await markVersionProcessing(db, v1.id);
    await markVersionReady(db, v1.id, {
      streamKey: `streams/${v1.id}`,
      durationMs: 3000,
      peaks: [0.5],
    });
    const v2 = (await createNextVersion(db, { trackId: track.id, original }))!;
    await markVersionProcessing(db, v2.id);
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    return { track, v1, v2 };
  }

  async function newProject(ownerId: string, visibility: Visibility) {
    const project = await createProject(db, { ownerId, title: 'EP' });
    await updateProject(db, project.id, { visibility });
    return project;
  }

  const request = (
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    { as, token, payload }: { as?: string; token?: string; payload?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(as && { authorization: `Bearer ${tokenFor(as)}` }),
        ...(token && { [SHARE_TOKEN_HEADER]: token }),
      },
      ...(payload && { payload }),
    });

  async function makeLink(
    path: string,
    payload: object = { role: 'listen' },
  ): Promise<CreateShareLinkResponse> {
    const res = await request('POST', `${path}/share-links`, { as: 'u1', payload });
    expect(res.statusCode).toBe(201);
    return res.json<CreateShareLinkResponse>();
  }

  describe('making, listing and revoking', () => {
    it('makes a link with a 256-bit token, storing only its hash', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'unlisted');

      const res = await request('POST', `/v1/tracks/${track.id}/share-links`, {
        as: 'u1',
        payload: { role: 'comment' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.headers['cache-control']).toBe('no-store');
      const { link, token } = res.json<CreateShareLinkResponse>();
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(link).toMatchObject({
        resourceType: 'track',
        resourceId: track.id,
        role: 'comment',
        expiresAt: null,
        revokedAt: null,
        active: true,
      });

      const [row] = await db.select().from(shareLinks).where(eq(shareLinks.id, link.id));
      expect(row!.tokenHash).toBe(hashShareToken(token));
      expect(JSON.stringify(row)).not.toContain(token);
    });

    it('lists a resource’s links newest first, without their tokens', async () => {
      const owner = await approvedUser('u1');
      const project = await newProject(owner.id, 'unlisted');
      const first = await makeLink(`/v1/projects/${project.id}`);
      const second = await makeLink(`/v1/projects/${project.id}`, {
        role: 'comment',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

      const res = await request('GET', `/v1/projects/${project.id}/share-links`, { as: 'u1' });
      const body = res.json<ShareLinkListResponse>();
      expect(body.links.map((l) => l.id)).toEqual([second.link.id, first.link.id]);
      expect(res.body).not.toContain(first.token);
      expect(res.body).not.toContain(second.token);
    });

    it('revokes a link, safely more than once', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'unlisted');
      const { link } = await makeLink(`/v1/tracks/${track.id}`);

      expect((await request('DELETE', `/v1/share-links/${link.id}`, { as: 'u1' })).statusCode).toBe(
        204,
      );
      expect((await request('DELETE', `/v1/share-links/${link.id}`, { as: 'u1' })).statusCode).toBe(
        204,
      );
      const list = await request('GET', `/v1/tracks/${track.id}/share-links`, { as: 'u1' });
      expect(list.json<ShareLinkListResponse>().links[0]).toMatchObject({
        id: link.id,
        active: false,
        revokedAt: expect.any(String),
      });
    });

    it('refuses an expiry that isn’t in the future, and an unknown role', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'unlisted');
      const past = await request('POST', `/v1/tracks/${track.id}/share-links`, {
        as: 'u1',
        payload: { role: 'listen', expiresAt: new Date(Date.now() - 1000).toISOString() },
      });
      expect(past.statusCode).toBe(400);
      expect(past.json()).toMatchObject({ error: { code: 'EXPIRY_IN_PAST' } });
      const owned = await request('POST', `/v1/tracks/${track.id}/share-links`, {
        as: 'u1',
        payload: { role: 'owner' },
      });
      expect(owned.statusCode).toBe(400);
    });

    it('is the owner’s alone: anyone else gets a 404, even holding a link', async () => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track } = await newTrack(owner.id, 'public');
      const { link, token } = await makeLink(`/v1/tracks/${track.id}`, { role: 'comment' });

      for (const who of [{ as: 'u2' }, {}, { token }, { as: 'u2', token }]) {
        const make = await request('POST', `/v1/tracks/${track.id}/share-links`, {
          ...who,
          payload: { role: 'listen' },
        });
        expect(make.statusCode).toBe(404);
        expect((await request('GET', `/v1/tracks/${track.id}/share-links`, who)).statusCode).toBe(
          404,
        );
        expect((await request('DELETE', `/v1/share-links/${link.id}`, who)).statusCode).toBe(404);
      }
      expect(
        (await request('DELETE', `/v1/share-links/${crypto.randomUUID()}`, { as: 'u1' }))
          .statusCode,
      ).toBe(404);
    });
  });

  describe('opening things with a link', () => {
    it('a track link opens an unlisted track to a listener, signed in or not', async () => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track, v1, v2 } = await newTrack(owner.id, 'unlisted');
      const { token } = await makeLink(`/v1/tracks/${track.id}`);

      for (const who of [{ token }, { as: 'u2', token }]) {
        const res = await request('GET', `/v1/tracks/${track.id}`, who);
        expect(res.statusCode).toBe(200);
        const body = res.json<TrackResponse>();
        // A listener's view: ready versions only, no file names or notes.
        expect(body.versions.map((v) => [v.id, v.originalFilename])).toEqual([[v1.id, null]]);
        expect(body.notes).toBeNull();
        expect((await request('GET', `/v1/versions/${v1.id}/stream`, who)).statusCode).toBe(200);
        expect((await request('GET', `/v1/versions/${v2.id}`, who)).statusCode).toBe(404);
      }
      expect((await request('GET', `/v1/tracks/${track.id}`)).statusCode).toBe(404);
    });

    it('stops working the moment it’s revoked', async () => {
      const owner = await approvedUser('u1');
      const { track, v1 } = await newTrack(owner.id, 'unlisted');
      const { link, token } = await makeLink(`/v1/tracks/${track.id}`);
      expect((await request('GET', `/v1/versions/${v1.id}/stream`, { token })).statusCode).toBe(
        200,
      );

      await request('DELETE', `/v1/share-links/${link.id}`, { as: 'u1' });
      expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(404);
      expect((await request('GET', `/v1/versions/${v1.id}/stream`, { token })).statusCode).toBe(
        404,
      );
    });

    it('stops working once it expires', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'unlisted');
      const { link, token } = await makeLink(`/v1/tracks/${track.id}`, {
        role: 'listen',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(200);

      await db
        .update(shareLinks)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(shareLinks.id, link.id));
      expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(404);
    });

    it('does nothing while the track is private, and works again once it’s unlisted', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'private');
      const { token } = await makeLink(`/v1/tracks/${track.id}`);
      expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(404);

      await setTrackVisibility(db, track.id, 'unlisted');
      expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(200);
    });

    it('opens only what it was made for', async () => {
      const owner = await approvedUser('u1');
      const project = await newProject(owner.id, 'unlisted');
      const { track: shared } = await newTrack(owner.id, 'unlisted', 'Shared');
      const { track: other } = await newTrack(owner.id, 'unlisted', 'Other');
      await moveTrackToProject(db, shared.id, project.id);
      await moveTrackToProject(db, other.id, project.id);
      const { token } = await makeLink(`/v1/tracks/${shared.id}`);

      const res = await request('GET', `/v1/tracks/${shared.id}`, { token });
      expect(res.statusCode).toBe(200);
      // A track's link doesn't reveal the project, or the other tracks in it.
      expect(res.json<TrackResponse>().projectId).toBeNull();
      expect((await request('GET', `/v1/tracks/${other.id}`, { token })).statusCode).toBe(404);
      expect((await request('GET', `/v1/projects/${project.id}`, { token })).statusCode).toBe(404);
      expect(
        (await request('GET', `/v1/projects/${project.id}/tracks`, { token })).statusCode,
      ).toBe(404);
    });

    it('a project link opens the project and its tracks that aren’t private', async () => {
      const owner = await approvedUser('u1');
      const project = await newProject(owner.id, 'unlisted');
      const following = await newTrack(owner.id, 'private', 'Following');
      const kept = await newTrack(owner.id, 'private', 'Kept private');
      await moveTrackToProject(db, following.track.id, project.id);
      await setTrackVisibility(db, following.track.id, null);
      await moveTrackToProject(db, kept.track.id, project.id);
      const { token } = await makeLink(`/v1/projects/${project.id}`);

      expect((await request('GET', `/v1/projects/${project.id}`, { token })).statusCode).toBe(200);
      const list = await request('GET', `/v1/projects/${project.id}/tracks`, { token });
      expect(list.json<ProjectTracksResponse>().tracks.map((t) => t.title)).toEqual(['Following']);
      const track = await request('GET', `/v1/tracks/${following.track.id}`, { token });
      expect(track.json<TrackResponse>().projectId).toBe(project.id);
      expect(
        (await request('GET', `/v1/versions/${following.v1.id}/stream`, { token })).statusCode,
      ).toBe(200);
      expect((await request('GET', `/v1/tracks/${kept.track.id}`, { token })).statusCode).toBe(404);
      expect(
        (await request('GET', `/v1/versions/${kept.v1.id}/stream`, { token })).statusCode,
      ).toBe(404);
    });

    it('a private project’s link opens none of its tracks, even unlisted ones', async () => {
      const owner = await approvedUser('u1');
      const project = await newProject(owner.id, 'private');
      const { track } = await newTrack(owner.id, 'private');
      await moveTrackToProject(db, track.id, project.id);
      await setTrackVisibility(db, track.id, 'unlisted');
      const projectLink = await makeLink(`/v1/projects/${project.id}`);
      const trackLink = await makeLink(`/v1/tracks/${track.id}`);

      const viaProject = await request('GET', `/v1/tracks/${track.id}`, {
        token: projectLink.token,
      });
      expect(viaProject.statusCode).toBe(404);
      // The track's own link does open it: the track itself is unlisted.
      const viaTrack = await request('GET', `/v1/tracks/${track.id}`, { token: trackLink.token });
      expect(viaTrack.statusCode).toBe(200);
    });

    it("deleting a project shuts its link off, though its tracks' own links live on", async () => {
      const owner = await approvedUser('u1');
      const project = await newProject(owner.id, 'unlisted');
      const { track } = await newTrack(owner.id, 'unlisted');
      await moveTrackToProject(db, track.id, project.id);
      const projectLink = await makeLink(`/v1/projects/${project.id}`);
      const trackLink = await makeLink(`/v1/tracks/${track.id}`);

      await deleteProject(db, project.id);
      const viaProject = await request('GET', `/v1/tracks/${track.id}`, {
        token: projectLink.token,
      });
      expect(viaProject.statusCode).toBe(404);
      const viaTrack = await request('GET', `/v1/tracks/${track.id}`, { token: trackLink.token });
      expect(viaTrack.statusCode).toBe(200);
    });

    it('a link never lets anyone change anything', async () => {
      const owner = await approvedUser('u1');
      await approvedUser('u2');
      const { track, v1 } = await newTrack(owner.id, 'unlisted');
      const { token } = await makeLink(`/v1/tracks/${track.id}`, { role: 'comment' });

      for (const who of [{ token }, { as: 'u2', token }]) {
        const patch = await app.inject({
          method: 'PATCH',
          url: `/v1/versions/${v1.id}`,
          headers: {
            [SHARE_TOKEN_HEADER]: token,
            ...(who.as && { authorization: `Bearer ${tokenFor(who.as)}` }),
          },
          payload: { changeNotes: 'Mine now' },
        });
        expect(patch.statusCode).toBe(404);
      }
    });

    it('ignores a malformed or unknown token rather than refusing the request', async () => {
      const owner = await approvedUser('u1');
      const { track } = await newTrack(owner.id, 'public');
      for (const token of ['nope', 'A'.repeat(43)]) {
        expect((await request('GET', `/v1/tracks/${track.id}`, { token })).statusCode).toBe(200);
      }
    });
  });
});
