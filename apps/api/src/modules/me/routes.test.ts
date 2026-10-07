import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profiles, setAccessStatus, upsertUserFromAuth, type Db } from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('GET /v1/me', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  const getMe = (authorization?: string) =>
    app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: authorization ? { authorization } : {},
    });

  it('returns 401 for anonymous requests', async () => {
    const res = await getMe();
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in required' },
    });
  });

  it.each([
    ['an invalid token', 'Bearer nope'],
    ['a non-bearer scheme', `Basic ${tokenFor('u1')}`],
    ['an empty bearer', 'Bearer '],
  ])('returns 401 for %s', async (_label, header) => {
    const res = await getMe(header);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('creates a pending user on first sign-in', async () => {
    const res = await getMe(`Bearer ${tokenFor('u1', 'New@X.test')}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      email: 'new@x.test',
      accessStatus: 'pending',
      profile: null,
    });
  });

  it('returns the same user on later requests', async () => {
    const first = await getMe(`Bearer ${tokenFor('u1')}`);
    const second = await getMe(`Bearer ${tokenFor('u1')}`);
    expect(second.json().id).toBe(first.json().id);
  });

  it('reports the current access status and profile', async () => {
    const user = await upsertUserFromAuth(db, { authProviderId: 'u1', email: 'u1@x.test' });
    await setAccessStatus(db, { email: 'u1@x.test', status: 'approved' });
    await db.insert(profiles).values({ userId: user.id, handle: 'artist', displayName: 'Artist' });

    const res = await getMe(`Bearer ${tokenFor('u1')}`);
    expect(res.json()).toEqual({
      id: user.id,
      email: 'u1@x.test',
      accessStatus: 'approved',
      profile: { handle: 'artist', displayName: 'Artist', avatarUrl: null },
    });
  });
});
