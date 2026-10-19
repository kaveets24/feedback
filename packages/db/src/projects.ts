import { and, asc, desc, eq, isNull, lt, max } from 'drizzle-orm';
import type { ProjectStatus } from '@feedback/shared';
import type { Db } from './client.ts';
import { projects, tracks, users, type Project, type Track } from './schema.ts';

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

/** Creates a project. New projects are private (CLAUDE.md section 6, rule 1). */
export async function createProject(
  db: Db,
  input: { ownerId: string; title: string; description?: string | null; status?: ProjectStatus },
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

export type ProjectChanges = Partial<Pick<Project, 'title' | 'description' | 'status'>>;

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
 * Soft-deletes a project. Its tracks become loose and keep their versions: deleting a folder
 * never deletes songs. Null if it doesn't exist or was already deleted.
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
      .set({ projectId: null, position: null, visibilityOverride: null })
      .where(eq(tracks.projectId, projectId));
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
 * Moves a track to the end of a project, or out of any project when `projectId` is null. Its
 * visibility override is cleared, since it was relative to the project it left. Moving a track
 * into the project it's already in leaves it where it is.
 *
 * Null if the track or project doesn't exist or was deleted, or they have different owners
 * (callers check access to both first; this is the backstop, along with the foreign key).
 */
export async function moveTrackToProject(
  db: Db,
  trackId: string,
  projectId: string | null,
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
    if (track.projectId === projectId) return track;

    let position: number | null = null;
    if (projectId) {
      const project = await findProject(tx, projectId);
      if (!project || project.ownerId !== track.ownerId) return null;
      const [last] = await tx
        .select({ position: max(tracks.position) })
        .from(tracks)
        .where(eq(tracks.projectId, projectId));
      position = (last?.position ?? -1) + 1;
    }

    const [moved] = await tx
      .update(tracks)
      .set({ projectId, position, visibilityOverride: null })
      .where(eq(tracks.id, trackId))
      .returning();
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
