import { and, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import {
  follows,
  profiles,
  projects,
  trackVersions,
  tracks,
  users,
  type Db,
  type Project,
  type Track,
} from '@feedback/db';
import { isPublicTrack } from '../profiles/repo.ts';

/** Follows someone; following them again changes nothing. */
export async function follow(db: Db, followerId: string, followeeId: string): Promise<void> {
  await db.insert(follows).values({ followerId, followeeId }).onConflictDoNothing();
}

export async function unfollow(db: Db, followerId: string, followeeId: string): Promise<void> {
  await db
    .delete(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
}

export async function isFollowing(db: Db, followerId: string, followeeId: string) {
  const [row] = await db
    .select({ id: follows.id })
    .from(follows)
    .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, followeeId)));
  return row !== undefined;
}

/**
 * Only follows of someone who still has a public page count: an approved account with a handle.
 * Someone who clears their handle drops out of their followers' lists and feeds until they set one.
 */
const withPublicPage = and(isNotNull(profiles.handle), eq(users.accessStatus, 'approved'));

/** Who someone follows, the most recently followed first, paged by the follow's id. */
export async function listFollowing(
  db: Db,
  followerId: string,
  { limit, before }: { limit: number; before?: string },
) {
  return db
    .select({ followId: follows.id, userId: follows.followeeId })
    .from(follows)
    .innerJoin(profiles, eq(profiles.userId, follows.followeeId))
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(
      and(
        eq(follows.followerId, followerId),
        withPublicPage,
        before ? lt(follows.id, before) : undefined,
      ),
    )
    .orderBy(desc(follows.id))
    .limit(limit);
}

export interface FeedRow {
  version: { id: string; versionNumber: number; durationMs: number | null; createdAt: Date };
  track: Track;
  project: Project | null;
}

/**
 * Ready versions of live public tracks (by effective visibility) by the people someone follows,
 * newest first, paged by version id. The service still checks each with `canAccess`.
 */
export async function listFeed(
  db: Db,
  followerId: string,
  { limit, before }: { limit: number; before?: string },
): Promise<FeedRow[]> {
  return db
    .select({
      version: {
        id: trackVersions.id,
        versionNumber: trackVersions.versionNumber,
        durationMs: trackVersions.durationMs,
        createdAt: trackVersions.createdAt,
      },
      track: tracks,
      project: projects,
    })
    .from(trackVersions)
    .innerJoin(tracks, eq(tracks.id, trackVersions.trackId))
    .innerJoin(follows, eq(follows.followeeId, tracks.ownerId))
    .innerJoin(profiles, eq(profiles.userId, tracks.ownerId))
    .innerJoin(users, eq(users.id, tracks.ownerId))
    .leftJoin(projects, and(eq(projects.id, tracks.projectId), isNull(projects.deletedAt)))
    .where(
      and(
        eq(follows.followerId, followerId),
        withPublicPage,
        eq(trackVersions.status, 'ready'),
        isNull(tracks.deletedAt),
        isPublicTrack,
        before ? lt(trackVersions.id, before) : undefined,
      ),
    )
    .orderBy(desc(trackVersions.id))
    .limit(limit);
}
