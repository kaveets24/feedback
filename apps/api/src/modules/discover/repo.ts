import { and, desc, eq, isNull, lt } from 'drizzle-orm';
import {
  projects,
  trackVersions,
  tracks,
  users,
  type Db,
  type Project,
  type Track,
} from '@feedback/db';
import type { Genre } from '@feedback/shared';
import { isPublicTrack } from '../profiles/repo.ts';

export interface DiscoverRow {
  track: Track;
  project: Project | null;
  version: { id: string; versionNumber: number; durationMs: number | null; createdAt: Date };
}

/**
 * Live public tracks (by effective visibility) of approved accounts, each with its current
 * version, newest current version first and paged by its id: UUIDv7, so a new version brings a
 * track back to the top. The service still checks each with `canAccess`.
 */
export async function listDiscover(
  db: Db,
  { genre, limit, before }: { genre?: Genre; limit: number; before?: string },
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
      .where(
        and(
          isNull(tracks.deletedAt),
          eq(users.accessStatus, 'approved'),
          eq(trackVersions.status, 'ready'),
          isPublicTrack,
          genre ? eq(tracks.genre, genre) : undefined,
          before ? lt(tracks.currentVersionId, before) : undefined,
        ),
      )
      .orderBy(desc(tracks.currentVersionId))
      .limit(limit)
  );
}
