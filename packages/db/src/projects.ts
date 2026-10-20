import { and, asc, desc, eq, inArray, isNull, lt, max, sql } from 'drizzle-orm';
import { effectiveVisibility, overrideOnJoin, type Visibility } from '@feedback/authz';
import type { ProjectStatus, ReleaseType } from '@feedback/shared';
import type { Db } from './client.ts';
import { projects, shareLinks, tracks, users, type Project, type Track } from './schema.ts';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** The helpers that also run inside the transactions below take either. */
type Queryable = Db | Tx;

/**
 * Serializes changes to which tracks are in an owner's projects, and where. Moving a track
 * touches two projects, so a per-owner lock is simpler than locking projects in a careful order,
 * and an artist editing their own work never contends with anyone else. `no key update` doesn't
 * block inserts that reference the user (new uploads), only other structure changes.
 */
async function lockOwnerProjects(tx: Tx, ownerId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, ownerId)).for('no key update');
}

const isLive = (projectId: string) => and(eq(projects.id, projectId), isNull(projects.deletedAt));

/** Creates a project. New projects are private (CLAUDE.md section 6, rule 1) singles. */
export async function createProject(
  db: Db,
  input: {
    ownerId: string;
    title: string;
    description?: string | null;
    releaseType?: ReleaseType;
    /** @deprecated Replaced by `releaseType`. */
    status?: ProjectStatus;
  },
): Promise<Project> {
  const [project] = await db.insert(projects).values(input).returning();
  if (!project) throw new Error('insert returned no project');
  return project;
}

/** A project by id, or null if it doesn't exist or was deleted. */
export async function findProject(db: Queryable, projectId: string): Promise<Project | null> {
  const [project] = await db.select().from(projects).where(isLive(projectId));
  return project ?? null;
}

/** Live projects by id, for working out the effective visibility of tracks in them. */
export async function findProjectsByIds(
  db: Queryable,
  projectIds: readonly string[],
): Promise<Map<string, Project>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(projects)
    .where(and(inArray(projects.id, [...new Set(projectIds)]), isNull(projects.deletedAt)));
  return new Map(rows.map((project) => [project.id, project]));
}

/**
 * An owner's projects, newest first. Pages by id like `listTracksForOwner`: pass the last id of
 * one page as `before` to get the next.
 */
export async function listProjectsForOwner(
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
        before ? lt(projects.id, before) : undefined,
      ),
    )
    .orderBy(desc(projects.id))
    .limit(limit);
}

export type ProjectChanges = Partial<
  Pick<Project, 'title' | 'description' | 'releaseType' | 'status' | 'visibility'>
>;

/** Applies `changes` to a live project. Null if it doesn't exist or was deleted. */
export async function updateProject(
  db: Db,
  projectId: string,
  changes: ProjectChanges,
): Promise<Project | null> {
  if (Object.keys(changes).length === 0) return findProject(db, projectId);
  const [project] = await db.update(projects).set(changes).where(isLive(projectId)).returning();
  return project ?? null;
}

/**
 * Soft-deletes a project and revokes its share links (CLAUDE.md section 6, rule 10). Its tracks
 * become loose and keep their versions, and their own links: deleting a folder never deletes
 * songs. Each keeps the visibility it had in the project, so who can hear it doesn't change
 * (rule 7). Null if it doesn't exist or was already deleted.
 */
export async function deleteProject(db: Db, projectId: string): Promise<Project | null> {
  return db.transaction(async (tx) => {
    const project = await findProject(tx, projectId);
    if (!project) return null;
    await lockOwnerProjects(tx, project.ownerId);

    const [deleted] = await tx
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(isLive(projectId))
      .returning();
    if (!deleted) return null;
    await tx
      .update(tracks)
      .set({
        projectId: null,
        position: null,
        visibility: sql`coalesce(${tracks.visibilityOverride}, ${deleted.visibility}::visibility)`,
        visibilityOverride: null,
      })
      .where(eq(tracks.projectId, projectId));
    await tx
      .update(shareLinks)
      .set({ revokedAt: deleted.deletedAt })
      .where(
        and(
          eq(shareLinks.resourceType, 'project'),
          eq(shareLinks.resourceId, projectId),
          isNull(shareLinks.revokedAt),
        ),
      );
    return deleted;
  });
}

/** A project's live tracks in order. */
export async function listProjectTracks(db: Queryable, projectId: string): Promise<Track[]> {
  return db
    .select()
    .from(tracks)
    .where(and(eq(tracks.projectId, projectId), isNull(tracks.deletedAt)))
    .orderBy(asc(tracks.position), asc(tracks.id));
}

/**
 * Moves a track to the end of a project, or out of any project when `projectId` is null. Moving
 * never lets more people hear it (CLAUDE.md section 6, rule 7): leaving a project, it keeps the
 * visibility it had there as its own; joining a project with a wider visibility, it gets an
 * override at its old one. Moving a track into the project it's already in leaves it where it is.
 *
 * Null if the track or project doesn't exist or was deleted, or they have different owners
 * (callers check access to both first; this is the backstop, along with the foreign key). With
 * `from`, also null (and nothing moves) unless the track is still in that project, so a
 * "remove from A" that loses a race with "move to B" doesn't take it out of B.
 */
export async function moveTrackToProject(
  db: Db,
  trackId: string,
  projectId: string | null,
  { from }: { from?: string | null } = {},
): Promise<Track | null> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ ownerId: tracks.ownerId })
      .from(tracks)
      .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));
    if (!found) return null;
    await lockOwnerProjects(tx, found.ownerId);

    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId));
    if (!track) return null;
    if (from !== undefined && track.projectId !== from) return null;
    if (track.projectId === projectId) return track;

    const current = effectiveVisibility(
      track,
      track.projectId ? await findProject(tx, track.projectId) : null,
    );
    let changes: Pick<Track, 'projectId' | 'position' | 'visibility' | 'visibilityOverride'>;
    if (projectId) {
      const project = await findProject(tx, projectId);
      if (!project || project.ownerId !== track.ownerId) return null;
      const [last] = await tx
        .select({ position: max(tracks.position) })
        .from(tracks)
        .where(eq(tracks.projectId, projectId));
      changes = {
        projectId,
        position: (last?.position ?? -1) + 1,
        // Ignored while it's in a project; kept so leaving again restores something sensible.
        visibility: current,
        visibilityOverride: overrideOnJoin(current, project.visibility),
      };
    } else {
      changes = { projectId: null, position: null, visibility: current, visibilityOverride: null };
    }

    const [moved] = await tx.update(tracks).set(changes).where(eq(tracks.id, trackId)).returning();
    return moved ?? null;
  });
}

export type ReorderResult =
  { ok: true; tracks: Track[] } | { ok: false; reason: 'not-found' | 'stale' };

/**
 * Puts a project's tracks in the given order. `trackIds` must name every live track in the
 * project exactly once; anything else (a track added or removed since the caller loaded the list,
 * a duplicate, a stranger's id) is `stale` and changes nothing, so concurrent edits can't
 * scramble the order.
 */
export async function reorderProjectTracks(
  db: Db,
  projectId: string,
  trackIds: string[],
): Promise<ReorderResult> {
  return db.transaction(async (tx) => {
    const project = await findProject(tx, projectId);
    if (!project) return { ok: false, reason: 'not-found' };
    await lockOwnerProjects(tx, project.ownerId);

    const current = await listProjectTracks(tx, projectId);
    const currentIds = new Set(current.map((t) => t.id));
    const matches =
      trackIds.length === current.length &&
      new Set(trackIds).size === trackIds.length &&
      trackIds.every((id) => currentIds.has(id));
    if (!matches) return { ok: false, reason: 'stale' };

    // Row by row is fine: projects hold tens of tracks, not thousands.
    for (const [position, id] of trackIds.entries()) {
      await tx
        .update(tracks)
        .set({ position })
        .where(and(eq(tracks.id, id), eq(tracks.projectId, projectId)));
    }
    return { ok: true, tracks: await listProjectTracks(tx, projectId) };
  });
}

export type SetTrackVisibilityResult =
  { ok: true; track: Track } | { ok: false; reason: 'not-found' | 'not-in-project' };

/**
 * Sets who can hear a track. A loose track's own visibility is set; a track in a project gets an
 * override, or with null goes back to following the project's. Null is `not-in-project` for a
 * loose track, which has no project to follow. Runs under the owner's project lock, so a move
 * can't land between reading where the track is and setting it.
 */
export async function setTrackVisibility(
  db: Db,
  trackId: string,
  visibility: Visibility | null,
): Promise<SetTrackVisibilityResult> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ ownerId: tracks.ownerId })
      .from(tracks)
      .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));
    if (!found) return { ok: false, reason: 'not-found' };
    await lockOwnerProjects(tx, found.ownerId);

    const [track] = await tx.select().from(tracks).where(eq(tracks.id, trackId));
    if (!track) return { ok: false, reason: 'not-found' };
    let changes: Partial<Pick<Track, 'visibility' | 'visibilityOverride'>>;
    if (track.projectId) changes = { visibilityOverride: visibility };
    else if (visibility) changes = { visibility };
    else return { ok: false, reason: 'not-in-project' };

    const [updated] = await tx
      .update(tracks)
      .set(changes)
      .where(eq(tracks.id, trackId))
      .returning();
    return updated ? { ok: true, track: updated } : { ok: false, reason: 'not-found' };
  });
}
