import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createAvatar,
  currentAvatar,
  findAvatar,
  latestAvatar,
  markAvatarFailed,
  markAvatarProcessing,
  markAvatarReady,
  removeAvatar,
} from './avatars.ts';
import { createDb } from './client.ts';
import { avatars, profiles } from './schema.ts';
import { resetDb, testDatabaseUrl } from './testing.ts';
import { upsertUserFromAuth } from './users.ts';

const db = createDb(testDatabaseUrl('db'));

beforeEach(() => resetDb(db));
afterAll(() => db.close());

const newUser = (n = 1) =>
  upsertUserFromAuth(db, { authProviderId: `auth_${n}`, email: `u${n}@x.test` });

const upload = (userId: string) =>
  createAvatar(db, { userId, contentType: 'image/png', sizeBytes: 1234 });

async function readyAvatar(userId: string) {
  const avatar = await upload(userId);
  await markAvatarProcessing(db, avatar.id);
  return (await markAvatarReady(db, avatar.id, `avatars/${avatar.id}.jpg`))!;
}

const currentAvatarId = async (userId: string) => {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  return profile?.currentAvatarId;
};

describe('createAvatar', () => {
  it('starts an upload with its original key derived from the avatar id', async () => {
    const user = await newUser();
    const avatar = await upload(user.id);
    expect(avatar).toMatchObject({
      userId: user.id,
      status: 'uploading',
      originalKey: `avatar-originals/${avatar.id}`,
      originalContentType: 'image/png',
      originalSizeBytes: 1234,
      imageKey: null,
    });
  });
});

describe('avatar status', () => {
  it('moves uploading -> processing -> ready, and repeats change nothing', async () => {
    const user = await newUser();
    const avatar = await upload(user.id);

    expect(await markAvatarReady(db, avatar.id, 'avatars/x.jpg')).toBeNull();
    expect(await markAvatarProcessing(db, avatar.id)).toMatchObject({ status: 'processing' });
    expect(await markAvatarProcessing(db, avatar.id)).toBeNull();
    expect(await markAvatarReady(db, avatar.id, 'avatars/x.jpg')).toMatchObject({
      status: 'ready',
      imageKey: 'avatars/x.jpg',
    });
    expect(await markAvatarReady(db, avatar.id, 'avatars/y.jpg')).toBeNull();
    expect(await markAvatarFailed(db, avatar.id, 'nope')).toBeNull();
  });

  it('fails from uploading or processing, with the reason', async () => {
    const user = await newUser();
    const first = await upload(user.id);
    expect(await markAvatarFailed(db, first.id, 'Bad image')).toMatchObject({
      status: 'failed',
      failureReason: 'Bad image',
    });
    const second = await upload(user.id);
    await markAvatarProcessing(db, second.id);
    expect(await markAvatarFailed(db, second.id, 'Bad image')).toMatchObject({ status: 'failed' });
  });
});

describe('markAvatarReady', () => {
  it('creates the profile if needed and makes the picture current', async () => {
    const user = await newUser();
    const avatar = await readyAvatar(user.id);
    expect(await currentAvatarId(user.id)).toBe(avatar.id);
  });

  it('keeps a newer picture current when an older upload finishes later', async () => {
    const user = await newUser();
    const older = await upload(user.id);
    await markAvatarProcessing(db, older.id);
    const newer = await readyAvatar(user.id);

    await markAvatarReady(db, older.id, `avatars/${older.id}.jpg`);
    expect(await currentAvatarId(user.id)).toBe(newer.id);
  });

  it("never touches another user's profile", async () => {
    const one = await newUser(1);
    const two = await newUser(2);
    const mine = await readyAvatar(one.id);
    await readyAvatar(two.id);
    expect(await currentAvatarId(one.id)).toBe(mine.id);
  });
});

describe('lookups', () => {
  it('finds an avatar, the newest upload, and the current picture', async () => {
    const user = await newUser();
    const ready = await readyAvatar(user.id);
    const pending = await upload(user.id);

    expect(await findAvatar(db, ready.id)).toMatchObject({ id: ready.id });
    expect(await findAvatar(db, crypto.randomUUID())).toBeNull();
    expect((await latestAvatar(db, user.id))?.id).toBe(pending.id);
    expect(await currentAvatar(db, user.id)).toMatchObject({
      id: ready.id,
      imageKey: `avatars/${ready.id}.jpg`,
    });
    expect(await currentAvatar(db, (await newUser(2)).id)).toBeNull();
  });
});

describe('removeAvatar', () => {
  it('clears the current picture and keeps the uploads; harmless with no profile', async () => {
    const user = await newUser();
    const avatar = await readyAvatar(user.id);
    await removeAvatar(db, user.id);
    expect(await currentAvatarId(user.id)).toBeNull();
    expect(await findAvatar(db, avatar.id)).not.toBeNull();

    const other = await newUser(2);
    await expect(removeAvatar(db, other.id)).resolves.toBeUndefined();
  });

  it('a deleted avatar row clears the profile pointer (on delete set null)', async () => {
    const user = await newUser();
    const avatar = await readyAvatar(user.id);
    await db.delete(avatars).where(eq(avatars.id, avatar.id));
    expect(await currentAvatarId(user.id)).toBeNull();
  });
});
