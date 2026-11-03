import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profiles, setAccessStatus, upsertUserFromAuth, type Db } from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import { PROFILE_SEARCH_LIMIT, type ProfileSearchResponse } from '@feedback/shared';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('GET /v1/profiles?q=', () => {
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

  async function person(
    providerId: string,
    profile: { handle?: string; displayName?: string } | null,
    approved = true,
  ) {
    const email = `${providerId}@x.test`;
    const user = await upsertUserFromAuth(db, { authProviderId: providerId, email });
    if (approved) await setAccessStatus(db, { email, status: 'approved' });
    if (profile) await db.insert(profiles).values({ userId: user.id, ...profile });
    return user;
  }

  const handles = async (q: string, providerId?: string) =>
    (await get(`/v1/profiles?q=${encodeURIComponent(q)}`, providerId))
      .json<ProfileSearchResponse>()
      .artists.map((artist) => artist.handle);

  it('finds public pages by handle or display name, an exact handle first, for anyone', async () => {
    await person('a', { handle: 'samantha', displayName: 'Sam A' });
    await person('b', { handle: 'sam', displayName: 'Another' });
    await person('c', { handle: 'zed', displayName: 'Uncle Sam' });
    await person('d', { handle: 'nobody', displayName: 'Nope' });

    expect(await handles('sam')).toEqual(['sam', 'samantha', 'zed']);
    expect(await handles('@SAM', 'a')).toEqual(['sam', 'samantha', 'zed']);
    const res = await get('/v1/profiles?q=uncle');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json<ProfileSearchResponse>()).toEqual({
      artists: [{ handle: 'zed', displayName: 'Uncle Sam', avatar: null }],
    });
  });

  it('leaves out anyone without a public page', async () => {
    // No handle: their name has only ever shown on comments.
    await person('a', { displayName: 'Sam No Handle' });
    await person('p', { handle: 'sam_pending', displayName: 'Sam' }, false);
    await person('n', null);

    expect(await handles('sam')).toEqual([]);
  });

  it(`returns at most ${PROFILE_SEARCH_LIMIT}, and needs 2 to 100 characters`, async () => {
    for (let i = 0; i < PROFILE_SEARCH_LIMIT + 2; i++) {
      await person(`u${i}`, { handle: `beat_${String(i).padStart(2, '0')}` });
    }
    expect(await handles('beat')).toHaveLength(PROFILE_SEARCH_LIMIT);

    expect((await get('/v1/profiles')).statusCode).toBe(400);
    expect((await get('/v1/profiles?q=b')).statusCode).toBe(400);
    expect((await get(`/v1/profiles?q=${'b'.repeat(101)}`)).statusCode).toBe(400);
  });
});
