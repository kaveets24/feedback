import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminUsage, runAdminCommand } from './admin.ts';
import { createDb } from './client.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import { findUserByEmail, upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl('db'));

beforeEach(async () => {
  await resetDb(db);
  await upsertUserFromAuth(db, { authProviderId: 'a', email: 'artist@x.test' });
  await upsertUserFromAuth(db, { authProviderId: 'b', email: 'admin@x.test' });
});
afterAll(() => db.close());

describe('runAdminCommand', () => {
  it('approves a pending user', async () => {
    await expect(runAdminCommand(db, ['approve', 'Artist@X.test'])).resolves.toBe(
      'artist@x.test: pending → approved',
    );
    const user = await findUserByEmail(db, 'artist@x.test');
    expect(user?.accessStatus).toBe('approved');
    expect(user?.approvedAt).toBeInstanceOf(Date);
    expect(user?.approvedBy).toBeNull();
  });

  it('records the approving admin with --by', async () => {
    await runAdminCommand(db, ['approve', 'artist@x.test', '--by', 'admin@x.test']);
    const admin = await findUserByEmail(db, 'admin@x.test');
    expect((await findUserByEmail(db, 'artist@x.test'))?.approvedBy).toBe(admin?.id);
  });

  it('rejects a user', async () => {
    await runAdminCommand(db, ['approve', 'artist@x.test']);
    await expect(runAdminCommand(db, ['reject', 'artist@x.test'])).resolves.toBe(
      'artist@x.test: approved → rejected',
    );
    expect((await findUserByEmail(db, 'artist@x.test'))?.approvedAt).toBeNull();
  });

  it.each([
    [[]],
    [['approve']],
    [['promote', 'artist@x.test']],
    [['approve', 'not-an-email']],
    [['approve', 'a@x.test', 'b@x.test']],
    [['reject', 'artist@x.test', '--by', 'admin@x.test']],
  ])('prints usage for bad input %j', async (argv) => {
    await expect(runAdminCommand(db, argv)).rejects.toThrow(adminUsage);
  });

  it('explains unknown users', async () => {
    await expect(runAdminCommand(db, ['approve', 'nobody@x.test'])).rejects.toThrow(
      /sign in once first/,
    );
    await expect(
      runAdminCommand(db, ['approve', 'artist@x.test', '--by', 'nobody@x.test']),
    ).rejects.toThrow(/--by/);
  });
});
