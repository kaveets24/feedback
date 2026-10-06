import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAccessStatus, upsertUserFromAuth, type Db } from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { AccessStatus } from '@feedback/shared';
import type { App } from '../app.ts';
import { buildTestApp, tokenFor } from '../testing/app.ts';

describe('invite-only access gate', () => {
  let app: App;
  let db: Db;

  beforeAll(async () => {
    ({ app, db } = await buildTestApp());
    // Stands in for any ordinary route that doesn't opt out of the gate.
    app.get('/test/protected', async () => ({ ok: true }));
  });
  beforeEach(() => resetDb(db));
  afterAll(() => app.close());

  async function tokenWithStatus(status: AccessStatus) {
    await upsertUserFromAuth(db, { authProviderId: status, email: `${status}@x.test` });
    await setAccessStatus(db, { email: `${status}@x.test`, status });
    return tokenFor(status);
  }

  const get = (url: string, token?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it.each([
    ['pending', 403, 'ACCOUNT_PENDING'],
    ['rejected', 403, 'ACCOUNT_REJECTED'],
    ['approved', 200, undefined],
  ] as const)('%s user on a protected route gets %i', async (status, code, errorCode) => {
    const res = await get('/test/protected', await tokenWithStatus(status));
    expect(res.statusCode).toBe(code);
    if (errorCode) expect(res.json().error.code).toBe(errorCode);
  });

  it.each(['pending', 'rejected', 'approved'] as const)(
    '%s user can read GET /v1/me',
    async (status) => {
      const res = await get('/v1/me', await tokenWithStatus(status));
      expect(res.statusCode).toBe(200);
      expect(res.json().accessStatus).toBe(status);
    },
  );

  it('a brand-new user is pending until approved', async () => {
    const token = tokenFor('newcomer');
    expect((await get('/test/protected', token)).statusCode).toBe(403);

    await setAccessStatus(db, { email: 'newcomer@x.test', status: 'approved' });
    expect((await get('/test/protected', token)).statusCode).toBe(200);
  });

  it('anonymous requests pass the gate; routes decide what they can see', async () => {
    expect((await get('/test/protected')).statusCode).toBe(200);
  });

  it('pending users can still reach health and the OpenAPI document', async () => {
    const token = await tokenWithStatus('pending');
    expect((await get('/v1/health', token)).statusCode).toBe(200);
    expect((await get('/v1/openapi.json', token)).statusCode).toBe(200);
  });
});
