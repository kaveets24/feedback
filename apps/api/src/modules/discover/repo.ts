import { and, desc, eq, ilike, isNull, lt, or, type SQL } from 'drizzle-orm';
import {
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

export interface DiscoverRow {
  track: Track;
  project: Project | null;
  version: { id: string; versionNumber: number; durationMs: number | null; createdAt: Date };
}

/**
 * Live public tracks (by effective visibility) of approved accounts, each with its current
 * version, newest current version first and paged by its id: UUIDv7, so a new version brings a
 * track back to the top. `genre` and `q` narrow them. The service still checks each with
 * `canAccess`.
 */
export async function listDiscover(
  db: Db,
  { genre, q, limit, before }: { genre?: Genre; q?: string; limit: number; before?: string },
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
          before ? lt(tracks.currentVersionId, before) : undefined,
        ),
      )
      .orderBy(desc(tracks.currentVersionId))
      .limit(limit)
  );
}
