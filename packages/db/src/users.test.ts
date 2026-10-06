import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDatabaseUrl } from '../test/db.ts';
import { createDb } from './client.ts';
import { findUserByAuthId, findUserByEmail, setAccessStatus, upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl);

beforeEach(() => resetDb(db));
afterAll(() => db.close());

describe('upsertUserFromAuth', () => {
  it('creates a pending user on first sight with a v7 id and lowercased email', async () => {
    const user = await upsertUserFromAuth(db, {
      authProviderId: 'auth_1',
      email: 'Artist@Example.com',
    });
    expect(user.accessStatus).toBe('pending');
    expect(user.email).toBe('artist@example.com');
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(user.approvedAt).toBeNull();
  });

  it('returns the same user on later calls', async () => {
    const first = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    const second = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    expect(second.id).toBe(first.id);
  });

  it('syncs a changed email without touching access status', async () => {
    const first = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    await setAccessStatus(db, { email: 'a@x.test', status: 'approved' });
    const updated = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'b@x.test' });
    expect(updated.id).toBe(first.id);
    expect(updated.email).toBe('b@x.test');
    expect(updated.accessStatus).toBe('approved');
  });
});

describe('find helpers', () => {
  it('find by auth id and case-insensitive email, or return null', async () => {
    const user = await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    expect((await findUserByAuthId(db, 'auth_1'))?.id).toBe(user.id);
    expect((await findUserByEmail(db, 'A@X.test'))?.id).toBe(user.id);
    expect(await findUserByAuthId(db, 'nope')).toBeNull();
    expect(await findUserByEmail(db, 'nope@x.test')).toBeNull();
  });
});

describe('setAccessStatus', () => {
  it('approving records when and by whom', async () => {
    const admin = await upsertUserFromAuth(db, { authProviderId: 'admin', email: 'admin@x.test' });
    await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });

    const user = await setAccessStatus(db, {
      email: 'a@x.test',
      status: 'approved',
      approvedBy: admin.id,
    });
    expect(user?.accessStatus).toBe('approved');
    expect(user?.approvedAt).toBeInstanceOf(Date);
    expect(user?.approvedBy).toBe(admin.id);
  });

  it('rejecting clears a previous approval', async () => {
    await upsertUserFromAuth(db, { authProviderId: 'auth_1', email: 'a@x.test' });
    await setAccessStatus(db, { email: 'a@x.test', status: 'approved' });

    const user = await setAccessStatus(db, { email: 'a@x.test', status: 'rejected' });
    expect(user?.accessStatus).toBe('rejected');
    expect(user?.approvedAt).toBeNull();
    expect(user?.approvedBy).toBeNull();
  });

  it('returns null for an unknown email', async () => {
    expect(await setAccessStatus(db, { email: 'nope@x.test', status: 'approved' })).toBeNull();
  });
});
