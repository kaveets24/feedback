import type { Db, User } from '@feedback/db';
import type { FeedResponse, FollowedArtist, FollowingResponse } from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { canAccessTrack } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { authorsFor } from '../feedback/service.ts';
import { findPublicProfile } from '../profiles/repo.ts';
import { follow, listFeed, listFollowing, unfollow } from './repo.ts';

// Following someone with a public page, and the feed of their new public work. The feed shows
// what everyone may hear, decided as nobody in particular, like their public page.
const everyone: Actor = { kind: 'anonymous' };

export interface FollowDeps {
  db: Db;
  storage: Storage;
}

/** The account behind a public page, or the usual 404. */
async function followee(db: Db, handle: string): Promise<string> {
  const profile = await findPublicProfile(db, handle.toLowerCase());
  if (!profile) throw httpError(404, 'NOT_FOUND', 'Not found');
  return profile.userId;
}

export async function followProfile(db: Db, user: User, handle: string): Promise<void> {
  const userId = await followee(db, handle);
  if (userId === user.id) throw httpError(400, 'CANNOT_FOLLOW_SELF', "You can't follow yourself");
  await follow(db, user.id, userId);
}

export async function unfollowProfile(db: Db, user: User, handle: string): Promise<void> {
  await unfollow(db, user.id, await followee(db, handle));
}

/** How each of these people shows: their handle (they all have one), name, and picture. */
async function artists(
  { db, storage }: FollowDeps,
  userIds: string[],
): Promise<Map<string, FollowedArtist>> {
  const authors = await authorsFor(db, storage, [...new Set(userIds)]);
  const found = new Map<string, FollowedArtist>();
  for (const [userId, { handle, displayName, avatar }] of authors) {
    if (handle) found.set(userId, { handle, displayName, avatar });
  }
  return found;
}

export async function getFollowing(
  deps: FollowDeps,
  user: User,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<FollowingResponse> {
  // One extra row says whether there's another page.
  const rows = await listFollowing(deps.db, user.id, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  const found = await artists(
    deps,
    page.map((row) => row.userId),
  );
  return {
    artists: page.flatMap((row) => found.get(row.userId) ?? []),
    nextCursor: rows.length > limit ? (page.at(-1)?.followId ?? null) : null,
  };
}

export async function getFeed(
  deps: FollowDeps,
  user: User,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<FeedResponse> {
  const rows = await listFeed(deps.db, user.id, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  const visible = page.filter(({ track, project }) =>
    canAccessTrack(everyone, track, project, 'listen'),
  );
  const found = await artists(
    deps,
    visible.map((row) => row.track.ownerId),
  );
  return {
    items: visible.flatMap(({ version, track }) => {
      const artist = found.get(track.ownerId);
      if (!artist) return [];
      return {
        versionId: version.id,
        versionNumber: version.versionNumber,
        // Set on every ready version.
        durationMs: version.durationMs ?? 0,
        createdAt: version.createdAt.toISOString(),
        track: { id: track.id, title: track.title },
        artist,
      };
    }),
    nextCursor: rows.length > limit ? (page.at(-1)?.version.id ?? null) : null,
  };
}
