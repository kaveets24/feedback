import { and, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import {
  profiles,
  projects,
  tracks,
  users,
  type Db,
  type Profile,
  type Project,
  type Track,
} from '@feedback/db';

/** The profile with this handle, if its account is approved: no one else has a public page. */
export async function findPublicProfile(db: Db, handle: string): Promise<Profile | null> {
  const [row] = await db
    .select({ profile: profiles })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(and(eq(profiles.handle, handle), eq(users.accessStatus, 'approved')));
  return row?.profile ?? null;
}

/**
 * An owner's public tracks with a ready version, newest first, paged by id like
 * `listTracksForOwner`. Public means by effective visibility: a loose track's own, or a project
 * track's override or else its live project's. The service still checks each with `canAccess`.
 */
export async function listPublicTracks(
  db: Db,
  ownerId: string,
  { limit, before }: { limit: number; before?: string },
): Promise<Track[]> {
  const rows = await db
    .select({ track: tracks })
    .from(tracks)
    .leftJoin(projects, and(eq(projects.id, tracks.projectId), isNull(projects.deletedAt)))
    .where(
      and(
        eq(tracks.ownerId, ownerId),
        isNull(tracks.deletedAt),
        isNotNull(tracks.currentVersionId),
        before ? lt(tracks.id, before) : undefined,
        sql`(case when ${projects.id} is null then ${tracks.visibility}
          else coalesce(${tracks.visibilityOverride}, ${projects.visibility}) end) = 'public'`,
      ),
    )
    .orderBy(desc(tracks.id))
    .limit(limit);
  return rows.map((row) => row.track);
}

/** An owner's public projects, newest first, paged by id like `listProjectsForOwner`. */
export async function listPublicProjects(
  db: Db,
  ownerId: string,
  { limit, before }: { limit: number; before?: string },
): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.ownerId, ownerId),
        isNull(projects.deletedAt),
        eq(projects.visibility, 'public'),
        before ? lt(projects.id, before) : undefined,
      ),
    )
    .orderBy(desc(projects.id))
    .limit(limit);
}
