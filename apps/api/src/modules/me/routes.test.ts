import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profiles, setAccessStatus, upsertUserFromAuth, type Db } from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

/** What a profile response carries when there's no picture and no upload. */
const noPicture = { avatar: null, avatarUpload: null };

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

describe('/v1/me/profile', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  const call = (method: 'GET' | 'PATCH', providerId?: string, payload?: object) =>
    app.inject({
      method,
      url: '/v1/me/profile',
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
      ...(payload && { payload }),
    });

  async function approvedUser(providerId: string) {
    const user = await upsertUserFromAuth(db, {
      authProviderId: providerId,
      email: `${providerId}@x.test`,
    });
    await setAccessStatus(db, { email: user.email, status: 'approved' });
    return user;
  }

  it('is empty before the first save', async () => {
    await approvedUser('u1');
    const res = await call('GET', 'u1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ displayName: null, bio: null, city: null, ...noPicture });
  });

  it('creates the profile on first save, without a handle', async () => {
    const user = await approvedUser('u1');
    const res = await call('PATCH', 'u1', {
      displayName: '  Night Owl ',
      bio: 'Bedroom pop.',
      city: 'portland-or',
      ...noPicture,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      displayName: 'Night Owl',
      bio: 'Bedroom pop.',
      city: 'portland-or',
      ...noPicture,
    });

    expect((await call('GET', 'u1')).json()).toEqual(res.json());
    const me = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: `Bearer ${tokenFor('u1')}` },
    });
    expect(me.json().profile).toEqual({ handle: null, displayName: 'Night Owl', avatarUrl: null });
    expect(me.json().id).toBe(user.id);
  });

  it('changes only the fields sent, and null or a blank bio clears one', async () => {
    await approvedUser('u1');
    await call('PATCH', 'u1', { displayName: 'Night Owl', bio: 'Bedroom pop.', city: 'miami' });

    expect((await call('PATCH', 'u1', { city: null })).json()).toEqual({
      displayName: 'Night Owl',
      bio: 'Bedroom pop.',
      city: null,
      ...noPicture,
    });
    expect((await call('PATCH', 'u1', { bio: '   ' })).json()).toMatchObject({ bio: null });
    expect((await call('PATCH', 'u1', { displayName: null })).json()).toMatchObject({
      displayName: null,
    });
    expect((await call('PATCH', 'u1', {})).json()).toEqual({
      displayName: null,
      bio: null,
      city: null,
      ...noPicture,
    });
  });

  it("keeps each user's profile to themselves", async () => {
    await approvedUser('u1');
    await approvedUser('u2');
    await call('PATCH', 'u1', { displayName: 'One', city: 'new-orleans' });
    await call('PATCH', 'u2', { displayName: 'Two' });

    expect((await call('GET', 'u1')).json()).toEqual({
      displayName: 'One',
      bio: null,
      city: 'new-orleans',
      ...noPicture,
    });
    expect((await call('GET', 'u2')).json()).toEqual({
      displayName: 'Two',
      bio: null,
      city: null,
      ...noPicture,
    });
  });

  it('rejects invalid input', async () => {
    await approvedUser('u1');
    for (const payload of [
      { displayName: '   ' },
      { displayName: 'x'.repeat(51) },
      { bio: 'x'.repeat(501) },
      { city: 'boston' },
      { city: 'Portland, OR' },
    ]) {
      expect((await call('PATCH', 'u1', payload)).statusCode).toBe(400);
    }
  });

  it('requires signing in and approval', async () => {
    expect((await call('GET')).statusCode).toBe(401);
    expect((await call('PATCH', undefined, { displayName: 'X' })).statusCode).toBe(401);

    await upsertUserFromAuth(db, { authProviderId: 'p1', email: 'p1@x.test' });
    for (const res of [await call('GET', 'p1'), await call('PATCH', 'p1', { displayName: 'X' })]) {
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ error: { code: 'ACCOUNT_PENDING' } });
    }
  });
});
