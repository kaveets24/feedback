import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { statusesBefore } from '@feedback/shared';
import type { Db } from './client.ts';
import { projectCovers, projects, type Project, type ProjectCover } from './schema.ts';

/**
 * Starts a cover upload (`uploading`) for a project. The original's storage key is derived from
 * the cover id (`cover-originals/<coverId>`), next to the audio originals' prefix (ADR 0008).
 */
export async function createCover(
  db: Db,
  input: { projectId: string; contentType: string; sizeBytes: number },
): Promise<ProjectCover> {
  const id = uuidv7();
  const [cover] = await db
    .insert(projectCovers)
    .values({
      id,
      projectId: input.projectId,
      originalKey: `cover-originals/${id}`,
      originalContentType: input.contentType,
      originalSizeBytes: input.sizeBytes,
    })
    .returning();
  if (!cover) throw new Error('insert returned no cover');
  return cover;
}

/** A cover and its project, or null if either doesn't exist or the project was deleted. */
export async function findCover(
  db: Db,
  coverId: string,
): Promise<{ cover: ProjectCover; project: Project } | null> {
  const [row] = await db
    .select({ cover: projectCovers, project: projects })
    .from(projectCovers)
    .innerJoin(projects, eq(projects.id, projectCovers.projectId))
    .where(and(eq(projectCovers.id, coverId), isNull(projects.deletedAt)));
  return row ?? null;
}

/** A project's newest cover upload in any status, or null if it has none. */
export async function latestCover(db: Db, projectId: string): Promise<ProjectCover | null> {
  const [cover] = await db
    .select()
    .from(projectCovers)
    .where(eq(projectCovers.projectId, projectId))
    .orderBy(desc(projectCovers.id))
    .limit(1);
  return cover ?? null;
}

/** The stored JPEG of each of these covers that's ready, by cover id. */
export async function coverKeys(db: Db, coverIds: string[]): Promise<Map<string, string>> {
  if (coverIds.length === 0) return new Map();
  const rows = await db
    .select({ id: projectCovers.id, coverKey: projectCovers.coverKey })
    .from(projectCovers)
    .where(and(inArray(projectCovers.id, coverIds), eq(projectCovers.status, 'ready')));
  return new Map(rows.flatMap(({ id, coverKey }) => (coverKey ? [[id, coverKey]] : [])));
}

// The status updates below are compare-and-set, like the version ones in tracks.ts: they apply
// only from a status that may move to the new one, and return null otherwise, so repeats and
// retried jobs are harmless.

/** `uploading -> processing`, once the upload is confirmed. */
export async function markCoverProcessing(db: Db, coverId: string): Promise<ProjectCover | null> {
  const [cover] = await db
    .update(projectCovers)
    .set({ status: 'processing' })
    .where(
      and(
        eq(projectCovers.id, coverId),
        inArray(projectCovers.status, statusesBefore('processing')),
      ),
    )
    .returning();
  return cover ?? null;
}

/** `uploading | processing -> failed`, with a reason for the artist. */
export async function markCoverFailed(
  db: Db,
  coverId: string,
  reason: string,
): Promise<ProjectCover | null> {
  const [cover] = await db
    .update(projectCovers)
    .set({ status: 'failed', failureReason: reason })
    .where(
      and(eq(projectCovers.id, coverId), inArray(projectCovers.status, statusesBefore('failed'))),
    )
    .returning();
  return cover ?? null;
}

/**
 * `processing -> ready`, with the stored JPEG, and makes it the project's cover unless a newer
 * one already is (cover ids are UUIDv7, so they order by when the upload started).
 */
export async function markCoverReady(
  db: Db,
  coverId: string,
  coverKey: string,
): Promise<ProjectCover | null> {
  return db.transaction(async (tx) => {
    const [cover] = await tx
      .update(projectCovers)
      .set({ status: 'ready', coverKey })
      .where(
        and(eq(projectCovers.id, coverId), inArray(projectCovers.status, statusesBefore('ready'))),
      )
      .returning();
    if (!cover) return null;
    await tx
      .update(projects)
      .set({ currentCoverId: cover.id })
      .where(
        and(
          eq(projects.id, cover.projectId),
          or(isNull(projects.currentCoverId), lt(projects.currentCoverId, cover.id)),
        ),
      );
    return cover;
  });
}

/** Takes the cover off a live project (its uploads stay). Null if the project is gone. */
export async function removeProjectCover(db: Db, projectId: string): Promise<Project | null> {
  const [project] = await db
    .update(projects)
    .set({ currentCoverId: null })
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .returning();
  return project ?? null;
}
