import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Visibility } from '@feedback/authz';
import {
  createAvatar,
  createNextVersion,
  createTrackWithFirstVersion,
  markAvatarProcessing,
  markAvatarReady,
  markVersionProcessing,
  markVersionReady,
  setAccessStatus,
  setTrackVisibility,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import {
  SHARE_TOKEN_HEADER,
  type CreateShareLinkResponse,
  type FeedbackListResponse,
  type FeedbackThread,
} from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

// u1 is the artist; u2 and u3 are listeners.
describe('feedback routes', () => {
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

  const original = { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 10 };

  /** The artist's track with a ready 3-minute v1 and a v2 still processing. */
  async function newTrack(visibility: Visibility = 'public') {
    const artist = await approvedUser('u1');
    await approvedUser('u2');
    await approvedUser('u3');
    const { track, version: v1 } = await createTrackWithFirstVersion(db, {
      ownerId: artist.id,
      title: 'Night drive',
      original,
    });
    await markVersionProcessing(db, v1.id);
    await markVersionReady(db, v1.id, {
      streamKey: `streams/${v1.id}`,
      durationMs: 180_000,
      peaks: [0.5],
    });
    const v2 = (await createNextVersion(db, { trackId: track.id, original }))!;
    await markVersionProcessing(db, v2.id);
    if (visibility !== 'private') await setTrackVisibility(db, track.id, visibility);
    return { artist, track, v1, v2 };
  }

  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

  const list = (versionId: string, as?: string, token?: string) =>
    request('GET', `/v1/versions/${versionId}/feedback`, { as, token });

  async function comment(versionId: string, as: string, payload: object, token?: string) {
    const res = await request('POST', `/v1/versions/${versionId}/feedback`, {
      as,
      token,
      payload,
    });
    expect(res.statusCode).toBe(201);
    return res.json<FeedbackThread>();
  }

  async function reply(feedbackId: string, as: string, body = 'Agreed') {
    const res = await request('POST', `/v1/feedback/${feedbackId}/replies`, {
      as,
      payload: { body },
    });
    expect(res.statusCode).toBe(201);
    return res.json<FeedbackThread>();
  }

  const patch = (feedbackId: string, as: string, payload: object) =>
    request('PATCH', `/v1/feedback/${feedbackId}`, { as, payload });

  const threads = async (versionId: string, as?: string, token?: string) => {
    const res = await list(versionId, as, token);
    expect(res.statusCode).toBe(200);
    return res.json<FeedbackListResponse>().threads;
  };

  describe('commenting', () => {
    it('pins a comment to a moment, with what each person may do with it', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', {
        body: '  Love the bridge  ',
        timestampMs: 83_000,
      });

      expect(thread).toMatchObject({
        body: 'Love the bridge',
        timestampMs: 83_000,
        status: 'open',
        resolvedAt: null,
        deleted: false,
        author: { displayName: null, handle: null, avatar: null },
        can: { reply: true, edit: true, delete: true, resolve: false },
        replies: [],
      });
      const [asArtist] = await threads(v1.id, 'u1');
      expect(asArtist!.can).toEqual({ reply: true, edit: false, delete: true, resolve: true });
      const [asOther] = await threads(v1.id, 'u3');
      expect(asOther!.can).toEqual({ reply: true, edit: false, delete: false, resolve: false });
      const [asAnonymous] = await threads(v1.id);
      expect(asAnonymous!.can).toEqual({
        reply: false,
        edit: false,
        delete: false,
        resolve: false,
      });
    });

    it('takes a general comment, and lists pinned ones in timeline order, then general ones', async () => {
      const { v1 } = await newTrack();
      await comment(v1.id, 'u2', { body: 'Overall: great' });
      await comment(v1.id, 'u2', { body: 'At 2:00', timestampMs: 120_000 });
      await comment(v1.id, 'u3', { body: 'At 0:10', timestampMs: 10_000 });
      await comment(v1.id, 'u3', { body: 'Also overall' });

      expect((await threads(v1.id, 'u1')).map((t) => t.body)).toEqual([
        'At 0:10',
        'At 2:00',
        'Overall: great',
        'Also overall',
      ]);
    });

    it('signs comments with the author’s name and picture', async () => {
      const { v1 } = await newTrack();
      await request('PATCH', '/v1/me/profile', {
        as: 'u2',
        payload: { displayName: 'Night Owl', handle: 'night_owl' },
      });
      const listener = await upsertUserFromAuth(db, { authProviderId: 'u2', email: 'u2@x.test' });
      const avatar = await createAvatar(db, {
        userId: listener.id,
        contentType: 'image/png',
        sizeBytes: 1,
      });
      await markAvatarProcessing(db, avatar.id);
      await markAvatarReady(db, avatar.id, `avatars/${avatar.id}.jpg`);

      const thread = await comment(v1.id, 'u2', { body: 'Hi' });
      expect(thread.author).toMatchObject({ displayName: 'Night Owl', handle: 'night_owl' });
      expect(new URL(thread.author!.avatar!.url).pathname).toContain(`avatars/${avatar.id}.jpg`);
      // Never who they are underneath.
      expect(JSON.stringify(thread)).not.toContain(listener.id);
    });

    it('needs an account to comment, but not to read', async () => {
      const { v1 } = await newTrack();
      await comment(v1.id, 'u2', { body: 'Hi' });
      expect(await threads(v1.id)).toHaveLength(1);

      const res = await request('POST', `/v1/versions/${v1.id}/feedback`, {
        payload: { body: 'Me too' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('refuses a moment past the end, a blank body, and a version not ready', async () => {
      const { v1, v2 } = await newTrack();
      const post = (versionId: string, payload: object) =>
        request('POST', `/v1/versions/${versionId}/feedback`, { as: 'u1', payload });

      expect((await post(v1.id, { body: 'Hi', timestampMs: 180_001 })).statusCode).toBe(400);
      expect((await post(v1.id, { body: 'Hi', timestampMs: 180_000 })).statusCode).toBe(201);
      expect((await post(v1.id, { body: '   ' })).statusCode).toBe(400);
      expect((await post(v1.id, { body: 'x'.repeat(2001) })).statusCode).toBe(400);
      // The artist can see a processing version, but nobody can comment on it yet.
      expect((await post(v2.id, { body: 'Hi' })).statusCode).toBe(409);
      // Listeners can't even see it.
      expect((await list(v2.id, 'u2')).statusCode).toBe(404);
    });
  });

  describe('who can see a track’s comments', () => {
    it('hides a private track’s comments from everyone but the artist, as a 404', async () => {
      const { v1 } = await newTrack('private');
      await comment(v1.id, 'u1', { body: 'Note to self' });

      expect(await threads(v1.id, 'u1')).toHaveLength(1);
      for (const as of ['u2', undefined]) {
        expect((await list(v1.id, as)).statusCode).toBe(404);
        const res = await request('POST', `/v1/versions/${v1.id}/feedback`, {
          as,
          payload: { body: 'Hi' },
        });
        expect(res.statusCode).toBe(404);
      }
    });

    it('lets signed-in link holders comment, anonymous ones read, until the link is revoked', async () => {
      const { track, v1 } = await newTrack('unlisted');
      const made = await request('POST', `/v1/tracks/${track.id}/share-links`, {
        as: 'u1',
        payload: {},
      });
      expect(made.statusCode).toBe(201);
      const { link, token } = made.json<CreateShareLinkResponse>();

      expect((await list(v1.id, 'u2')).statusCode).toBe(404);
      const thread = await comment(v1.id, 'u2', { body: 'Via the link' }, token);
      expect(await threads(v1.id, undefined, token)).toHaveLength(1);
      const anonymous = await request('POST', `/v1/versions/${v1.id}/feedback`, {
        token,
        payload: { body: 'Hi' },
      });
      expect(anonymous.statusCode).toBe(401);

      await request('DELETE', `/v1/share-links/${link.id}`, { as: 'u1' });
      // The author loses their own comment along with the track.
      expect((await list(v1.id, 'u2', token)).statusCode).toBe(404);
      const edit = await request('PATCH', `/v1/feedback/${thread.id}`, {
        as: 'u2',
        token,
        payload: { body: 'Edited' },
      });
      expect(edit.statusCode).toBe(404);
    });

    it('takes comments away from their author when the track goes private', async () => {
      const { track, v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Hi' });
      await setTrackVisibility(db, track.id, 'private');

      expect((await list(v1.id, 'u2')).statusCode).toBe(404);
      expect((await patch(thread.id, 'u2', { body: 'Edited' })).statusCode).toBe(404);
      expect((await request('DELETE', `/v1/feedback/${thread.id}`, { as: 'u2' })).statusCode).toBe(
        404,
      );
      expect(await threads(v1.id, 'u1')).toHaveLength(1);
    });
  });

  describe('replies', () => {
    it('adds replies under the thread, oldest first, one level deep', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Bridge?', timestampMs: 60_000 });
      await reply(thread.id, 'u1', 'Working on it');
      const after = await reply(thread.id, 'u3', 'Same thought');

      expect(after.replies.map((r) => r.body)).toEqual(['Working on it', 'Same thought']);
      expect(after.replies[0]!.can).toEqual({
        reply: false,
        edit: false,
        delete: false,
        resolve: false,
      });
      expect(after.replies[1]!.can).toMatchObject({ edit: true, delete: true });

      const nested = await request('POST', `/v1/feedback/${after.replies[0]!.id}/replies`, {
        as: 'u2',
        payload: { body: 'Nested' },
      });
      expect(nested.statusCode).toBe(400);
      expect(nested.json().error.code).toBe('NOT_A_THREAD');
    });

    it('needs an account to reply', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Hi' });
      const res = await request('POST', `/v1/feedback/${thread.id}/replies`, {
        payload: { body: 'Hi back' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('editing and resolving', () => {
    it('lets only the author edit the words', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Typo' });

      const res = await patch(thread.id, 'u2', { body: 'Fixed' });
      expect(res.statusCode).toBe(200);
      expect(res.json<FeedbackThread>().body).toBe('Fixed');
      for (const as of ['u1', 'u3']) {
        expect((await patch(thread.id, as, { body: 'Not yours' })).statusCode).toBe(403);
      }
      expect((await patch(thread.id, 'u2', {})).statusCode).toBe(400);
    });

    it('lets only the artist resolve and reopen a thread', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Kick is loud', timestampMs: 5000 });

      const resolved = (
        await patch(thread.id, 'u1', { status: 'resolved' })
      ).json<FeedbackThread>();
      expect(resolved.status).toBe('resolved');
      expect(resolved.resolvedAt).not.toBeNull();
      const reopened = (await patch(thread.id, 'u1', { status: 'open' })).json<FeedbackThread>();
      expect(reopened).toMatchObject({ status: 'open', resolvedAt: null });
      expect((await patch(thread.id, 'u1', { status: 'open' })).statusCode).toBe(200);

      for (const as of ['u2', 'u3']) {
        expect((await patch(thread.id, as, { status: 'resolved' })).statusCode).toBe(403);
      }
      const withReply = await reply(thread.id, 'u3');
      const res = await patch(withReply.replies[0]!.id, 'u1', { status: 'resolved' });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('deleting', () => {
    it('lets the author or the artist delete, nobody else; repeating it is fine', async () => {
      const { v1 } = await newTrack();
      const mine = await comment(v1.id, 'u2', { body: 'Mine' });
      const other = await comment(v1.id, 'u3', { body: 'Spam' });
      const del = (id: string, as: string) => request('DELETE', `/v1/feedback/${id}`, { as });

      expect((await del(mine.id, 'u3')).statusCode).toBe(403);
      expect((await del(mine.id, 'u2')).statusCode).toBe(204);
      expect((await del(mine.id, 'u2')).statusCode).toBe(204);
      expect((await del(other.id, 'u1')).statusCode).toBe(204);
      expect(await threads(v1.id, 'u1')).toEqual([]);
      expect((await patch(mine.id, 'u2', { body: 'Back?' })).statusCode).toBe(404);
    });

    it('keeps a deleted comment’s place while it has replies, without its words or author', async () => {
      const { v1 } = await newTrack();
      const thread = await comment(v1.id, 'u2', { body: 'Regret this', timestampMs: 1000 });
      const withReply = await reply(thread.id, 'u3', 'Still useful');
      await request('DELETE', `/v1/feedback/${thread.id}`, { as: 'u2' });

      const [kept] = await threads(v1.id, 'u3');
      expect(kept).toMatchObject({
        id: thread.id,
        body: null,
        deleted: true,
        author: null,
        timestampMs: 1000,
        can: { reply: false, edit: false, delete: false, resolve: false },
      });
      expect(kept!.replies.map((r) => r.body)).toEqual(['Still useful']);

      await request('DELETE', `/v1/feedback/${withReply.replies[0]!.id}`, { as: 'u3' });
      expect(await threads(v1.id, 'u3')).toEqual([]);
      const late = await request('POST', `/v1/feedback/${thread.id}/replies`, {
        as: 'u3',
        payload: { body: 'Late' },
      });
      expect(late.statusCode).toBe(404);
    });
  });
});
