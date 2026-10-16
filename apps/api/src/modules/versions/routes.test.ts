import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackWithFirstVersion,
  setAccessStatus,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import { resetDb } from '@feedback/db/testing';
import type { App } from '../../app.ts';
import { buildTestApp, tokenFor } from '../../testing/app.ts';

describe('GET /v1/versions/:versionId', () => {
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

  async function ownedVersion(providerId: string) {
    const owner = await approvedUser(providerId);
    return createTrackWithFirstVersion(db, {
      ownerId: owner.id,
      title: 'Idea',
      original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 10 },
    });
  }

  const get = (versionId: string, providerId?: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/versions/${versionId}`,
      headers: providerId ? { authorization: `Bearer ${tokenFor(providerId)}` } : {},
    });

  it("returns the owner's version and its status", async () => {
    const { track, version } = await ownedVersion('u1');
    const res = await get(version.id, 'u1');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      id: version.id,
      trackId: track.id,
      versionNumber: 1,
      status: 'uploading',
      failureReason: null,
      durationMs: null,
    });
  });

  it('returns 404 to anyone else, as if it did not exist', async () => {
    const { version } = await ownedVersion('u1');
    await approvedUser('u2');
    expect((await get(version.id, 'u2')).statusCode).toBe(404);
    expect((await get(version.id)).statusCode).toBe(404);
    expect((await get(crypto.randomUUID(), 'u1')).statusCode).toBe(404);
  });
});
