import type { Db, Profile, User } from '@feedback/db';
import type { MeResponse, ProfileResponse, UpdateProfileRequest } from '@feedback/shared';
import { findProfile, saveProfile, type ProfileChanges } from './repo.ts';

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

function respond(profile: Profile | null): ProfileResponse {
  return {
    displayName: profile?.displayName ?? null,
    bio: profile?.bio ?? null,
    city: profile?.city ?? null,
  };
}

/** The user's own profile, with every field empty until they first save it. */
export async function getProfile(db: Db, user: User): Promise<ProfileResponse> {
  return respond(await findProfile(db, user.id));
}

export async function updateProfile(
  db: Db,
  user: User,
  input: UpdateProfileRequest,
): Promise<ProfileResponse> {
  const changes: ProfileChanges = {};
  if (input.displayName !== undefined) changes.displayName = input.displayName;
  // A blank bio is no bio.
  if (input.bio !== undefined) changes.bio = input.bio || null;
  if (input.city !== undefined) changes.city = input.city;
  return respond(await saveProfile(db, user.id, changes));
}
