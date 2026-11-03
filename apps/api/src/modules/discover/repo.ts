import { and, desc, eq, exists, ilike, isNotNull, isNull, lt, or, type SQL } from 'drizzle-orm';
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
import type { Genre } from '@feedback/shared';
import { containsPattern, isPublicTrack } from '../profiles/repo.ts';

/** Tracks whose title, or artist's display name or handle, contains the term. */
function matchesTrack(term: string): SQL | undefined {
  const pattern = containsPattern(term);
  return or(
    ilike(tracks.title, pattern),
    ilike(profiles.displayName, pattern),
    ilike(profiles.handle, pattern),
  );
}

/** Tracks by someone `followerId` follows who has a public page. Needs `profiles` joined. */
function followedBy(db: Db, followerId: string): SQL | undefined {
  return and(
    isNotNull(profiles.handle),
    exists(
      db
        .select({ id: follows.id })
        .from(follows)
        .where(and(eq(follows.followerId, followerId), eq(follows.followeeId, tracks.ownerId))),
    ),
  );
}

export interface DiscoverRow {
  track: Track;
  project: Project | null;
  version: { id: string; versionNumber: number; durationMs: number | null; createdAt: Date };
}

/**
 * Live public tracks (by effective visibility) of approved accounts, each with its current
 * version, newest current version first and paged by its id: UUIDv7, so a new version brings a
 * track back to the top. `genre` and `q` narrow them, and `followerId` keeps only the people that
 * user follows who still have a public page (a handle), like the feed. The service still checks
 * each with `canAccess`.
 */
export async function listDiscover(
  db: Db,
  {
    genre,
    q,
    followerId,
    limit,
    before,
  }: { genre?: Genre; q?: string; followerId?: string; limit: number; before?: string },
): Promise<DiscoverRow[]> {
  return (
    db
      .select({
        track: tracks,
        project: projects,
        version: {
          id: trackVersions.id,
          versionNumber: trackVersions.versionNumber,
          durationMs: trackVersions.durationMs,
          createdAt: trackVersions.createdAt,
        },
      })
      .from(tracks)
      // The current version is always a ready one.
      .innerJoin(trackVersions, eq(trackVersions.id, tracks.currentVersionId))
      .innerJoin(users, eq(users.id, tracks.ownerId))
      .leftJoin(projects, and(eq(projects.id, tracks.projectId), isNull(projects.deletedAt)))
      // For `q`, which also matches the artist's name.
      .leftJoin(profiles, eq(profiles.userId, tracks.ownerId))
      .where(
        and(
          isNull(tracks.deletedAt),
          eq(users.accessStatus, 'approved'),
          eq(trackVersions.status, 'ready'),
          isPublicTrack,
          genre ? eq(tracks.genre, genre) : undefined,
          q ? matchesTrack(q) : undefined,
          followerId ? followedBy(db, followerId) : undefined,
          before ? lt(tracks.currentVersionId, before) : undefined,
        ),
      )
      .orderBy(desc(tracks.currentVersionId))
      .limit(limit)
  );
}
