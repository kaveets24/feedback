import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackWithFirstVersion,
  markVersionProcessing,
  markVersionReady,
  setAccessStatus,
  setTrackVisibility,
  tracks,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { FeedbackThread, NotificationListResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';
import { excerpt } from './service.ts';

// u1 is the artist; u2 and u3 are listeners on u1's public track.
describe('notification routes', () => {
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

  async function newTrack() {
    const artist = await approvedUser('u1');
    await approvedUser('u2');
    await approvedUser('u3');
    const { track, version } = await createTrackWithFirstVersion(db, {
      ownerId: artist.id,
      title: 'Night drive',
      original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
    await markVersionProcessing(db, version.id);
    await markVersionReady(db, version.id, {
      streamKey: `streams/${version.id}`,
      durationMs: 180_000,
      peaks: [0.5],
    });
    await setTrackVisibility(db, track.id, 'public');
    return { track, version };
  }

  const request = (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    as?: string,
    payload?: object,
  ) =>
    app.inject({
      method,
      url,
      headers: as ? { authorization: `Bearer ${tokenFor(as)}` } : {},
      ...(payload && { payload }),
    });

  async function comment(versionId: string, as: string, body = 'Love the bridge') {
    const res = await request('POST', `/v1/versions/${versionId}/feedback`, as, {
      body,
      timestampMs: 83_000,
    });
    expect(res.statusCode).toBe(201);
    return res.json<FeedbackThread>();
  }

  async function reply(feedbackId: string, as: string) {
    const res = await request('POST', `/v1/feedback/${feedbackId}/replies`, as, { body: 'Yes!' });
    expect(res.statusCode).toBe(201);
    return res.json<FeedbackThread>();
  }

  const list = async (as = 'u1', query = '') =>
    (await request('GET', `/v1/notifications${query}`, as)).json<NotificationListResponse>();
  const unread = async (as = 'u1') =>
    (await request('GET', '/v1/notifications/unread-count', as)).json<{ count: number }>().count;

  it('tells the artist about someone else’s comment, and not their own', async () => {
    const { track, version } = await newTrack();
    await request('PATCH', '/v1/me/profile', 'u2', { displayName: 'Sam' });
    const thread = await comment(version.id, 'u2');
    await comment(version.id, 'u1', 'Note to self');

    const { notifications, nextCursor } = await list();
    expect(notifications).toEqual([
      {
        id: expect.any(String),
        type: 'comment',
        read: false,
        createdAt: expect.any(String),
        actor: { displayName: 'Sam', avatar: null },
        track: { id: track.id, title: 'Night drive' },
        versionNumber: 1,
        feedbackId: thread.id,
        excerpt: 'Love the bridge',
      },
    ]);
    expect(nextCursor).toBeNull();
    expect(await unread()).toBe(1);
    // Listeners get nothing (for now).
    expect((await list('u2')).notifications).toEqual([]);
  });

  it('tells the artist about replies by others, newest first, a page at a time', async () => {
    const { version } = await newTrack();
    const thread = await comment(version.id, 'u2');
    await reply(thread.id, 'u1');
    const answered = await reply(thread.id, 'u3');

    const first = await list('u1', '?limit=1');
    expect(first.notifications.map((n) => [n.type, n.feedbackId])).toEqual([
      ['reply', answered.replies[1]!.id],
    ]);
    const second = await list('u1', `?limit=1&cursor=${first.nextCursor}`);
    expect(second.notifications.map((n) => n.type)).toEqual(['comment']);
    expect(second.nextCursor).toBeNull();
  });

  it('marks notifications read, only your own', async () => {
    const { version } = await newTrack();
    await comment(version.id, 'u2');
    await comment(version.id, 'u3');
    const [newest, oldest] = (await list()).notifications;

    expect(
      (await request('POST', '/v1/notifications/read', 'u2', { ids: [newest!.id] })).statusCode,
    ).toBe(204);
    expect(await unread()).toBe(2);
    await request('POST', '/v1/notifications/read', 'u1', { ids: [newest!.id] });
    expect(await unread()).toBe(1);
    expect((await list()).notifications.map((n) => [n.id, n.read])).toEqual([
      [newest!.id, true],
      [oldest!.id, false],
    ]);
  });

  it('drops a notification when its comment is deleted or its track goes', async () => {
    const { track, version } = await newTrack();
    const thread = await comment(version.id, 'u2');
    await comment(version.id, 'u3');
    expect(await unread()).toBe(2);

    await request('DELETE', `/v1/feedback/${thread.id}`, 'u2');
    expect((await list()).notifications).toHaveLength(1);
    expect(await unread()).toBe(1);

    // No route deletes a track yet; it's a soft delete either way.
    await db.update(tracks).set({ deletedAt: new Date() }).where(eq(tracks.id, track.id));
    expect((await list()).notifications).toEqual([]);
    expect(await unread()).toBe(0);
  });

  it('needs an account', async () => {
    expect((await request('GET', '/v1/notifications')).statusCode).toBe(401);
    expect((await request('GET', '/v1/notifications/unread-count')).statusCode).toBe(401);
    const mark = await request('POST', '/v1/notifications/read', undefined, {
      ids: [crypto.randomUUID()],
    });
    expect(mark.statusCode).toBe(401);
  });

  it('quotes a comment on one line, cut with an ellipsis when long', () => {
    expect(excerpt('  Line one\n\nline two  ')).toBe('Line one line two');
    const long = excerpt('word '.repeat(60));
    expect(long).toHaveLength(140);
    expect(long.endsWith('…')).toBe(true);
  });
});
