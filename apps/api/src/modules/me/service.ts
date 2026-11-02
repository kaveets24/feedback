import type { Db, Profile, User } from '@feedback/db';
import type { Storage } from '@feedback/storage';
import { avatarForProfile } from '../avatars/service.ts';
import type { MeResponse, ProfileResponse, UpdateProfileRequest } from '@feedback/shared';
import { httpError } from '../../errors.ts';
import { findProfile, isHandleTaken, saveProfile, type ProfileChanges } from './repo.ts';

export async function getMe(db: Db, user: User): Promise<MeResponse> {
  const profile = await findProfile(db, user.id);
  return {
    id: user.id,
    email: user.email,
    accessStatus: user.accessStatus,
    profile: profile && {
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    },
  };
}

export interface ProfileDeps {
  db: Db;
  storage: Storage;
}

async function respond(
  deps: ProfileDeps,
  user: User,
  profile: Profile | null,
): Promise<ProfileResponse> {
  return {
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? null,
    bio: profile?.bio ?? null,
    city: profile?.city ?? null,
    ...(await avatarForProfile(deps, user, profile)),
  };
}

/** The user's own profile, with every field empty until they first save it. */
export async function getProfile(deps: ProfileDeps, user: User): Promise<ProfileResponse> {
  return respond(deps, user, await findProfile(deps.db, user.id));
}

export async function updateProfile(
  deps: ProfileDeps,
  user: User,
  input: UpdateProfileRequest,
): Promise<ProfileResponse> {
  const changes: ProfileChanges = {};
  if (input.handle !== undefined) changes.handle = input.handle;
  if (input.displayName !== undefined) changes.displayName = input.displayName;
  // A blank bio is no bio.
  if (input.bio !== undefined) changes.bio = input.bio || null;
  if (input.city !== undefined) changes.city = input.city;
  const saved = await saveProfile(deps.db, user.id, changes).catch((err: unknown) => {
    if (isHandleTaken(err)) throw httpError(409, 'HANDLE_TAKEN', 'That handle is taken');
    throw err;
  });
  return respond(deps, user, saved);
}
