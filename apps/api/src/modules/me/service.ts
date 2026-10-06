import type { Db, User } from '@feedback/db';
import type { MeResponse } from '@feedback/shared';
import { findProfile } from './repo.ts';

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
