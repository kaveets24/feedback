import { and, asc, eq, inArray, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm';
import type { Db } from './client.ts';
import { deleteTrack } from './projects.ts';
import { avatars, projectCovers, trackVersions, tracks } from './schema.ts';

// Queries for the worker's cleanup of uploads that got stuck (CLAUDE.md Phase 7): uploads the
// browser never finished, and processing whose job was lost. Each is compare-and-set like the
// status updates in tracks.ts, so a repeat, or an upload that finishes at the last moment, is
// harmless.

/** An abandoned upload, marked failed: its id and the original that may be in storage. */
export interface AbandonedUpload {
  id: string;
  originalKey: string;
}

type Options = { before: Date; reason: string; limit: number };

/**
 * Marks versions still `uploading` that were started before `before` as failed with `reason`,
 * oldest first, up to `limit`. Returns them with their track, so the caller can delete what was
 * uploaded and clear away tracks that never got a file (`deleteAbandonedTracks`).
 */
export async function failAbandonedVersions(
  db: Db,
  { before, reason, limit }: Options,
): Promise<(AbandonedUpload & { trackId: string })[]> {
  const stale = db
    .select({ id: trackVersions.id })
    .from(trackVersions)
    .where(and(eq(trackVersions.status, 'uploading'), lt(trackVersions.createdAt, before)))
    .orderBy(asc(trackVersions.id))
    .limit(limit);
  return db
    .update(trackVersions)
    .set({ status: 'failed', failureReason: reason })
    .where(and(inArray(trackVersions.id, stale), eq(trackVersions.status, 'uploading')))
    .returning({
      id: trackVersions.id,
      trackId: trackVersions.trackId,
      originalKey: trackVersions.originalKey,
    });
}

/**
 * Soft-deletes live tracks that never got a file: every version failed as abandoned (`reason`).
 * Their uploads never arrived, so the artist never saw them in a list; deleting them the usual way
 * also revokes any share links. A track with any other version (ready, processing, or failed for
 * another reason) stays. Returns the deleted tracks' ids.
 */
export async function deleteAbandonedTracks(db: Db, reason: string): Promise<string[]> {
  const ghosts = await db
    .select({ id: tracks.id })
    .from(tracks)
    .where(
      and(
        isNull(tracks.deletedAt),
        isNull(tracks.currentVersionId),
        notExists(
          db
            .select({ id: trackVersions.id })
            .from(trackVersions)
            .where(
              and(
                eq(trackVersions.trackId, tracks.id),
                or(
                  ne(trackVersions.status, 'failed'),
                  sql`${trackVersions.failureReason} is distinct from ${reason}`,
                ),
              ),
            ),
        ),
      ),
    );
  const deleted: string[] = [];
  for (const { id } of ghosts) {
    if (await deleteTrack(db, id)) deleted.push(id);
  }
  return deleted;
}

/** `failAbandonedVersions` for project cover uploads. */
export async function failAbandonedCovers(
  db: Db,
  { before, reason, limit }: Options,
): Promise<AbandonedUpload[]> {
  const stale = db
    .select({ id: projectCovers.id })
    .from(projectCovers)
    .where(and(eq(projectCovers.status, 'uploading'), lt(projectCovers.createdAt, before)))
    .orderBy(asc(projectCovers.id))
    .limit(limit);
  return db
    .update(projectCovers)
    .set({ status: 'failed', failureReason: reason })
    .where(and(inArray(projectCovers.id, stale), eq(projectCovers.status, 'uploading')))
    .returning({ id: projectCovers.id, originalKey: projectCovers.originalKey });
}

/** `failAbandonedVersions` for profile picture uploads. */
export async function failAbandonedAvatars(
  db: Db,
  { before, reason, limit }: Options,
): Promise<AbandonedUpload[]> {
  const stale = db
    .select({ id: avatars.id })
    .from(avatars)
    .where(and(eq(avatars.status, 'uploading'), lt(avatars.createdAt, before)))
    .orderBy(asc(avatars.id))
    .limit(limit);
  return db
    .update(avatars)
    .set({ status: 'failed', failureReason: reason })
    .where(and(inArray(avatars.id, stale), eq(avatars.status, 'uploading')))
    .returning({ id: avatars.id, originalKey: avatars.originalKey });
}

/** Uploads that have been `processing` since before `before`: their jobs may have been lost. */
export interface StuckProcessing {
  versions: string[];
  covers: string[];
  avatars: string[];
}

/**
 * Versions, covers, and pictures that moved to `processing` before `before` and are still there,
 * oldest first, up to `limit` of each. `updated_at` is when they moved: nothing else changes a
 * row while it's processing.
 */
export async function findStuckProcessing(
  db: Db,
  { before, limit }: { before: Date; limit: number },
): Promise<StuckProcessing> {
  const [versions, covers, avatarRows] = await Promise.all([
    db
      .select({ id: trackVersions.id })
      .from(trackVersions)
      .where(and(eq(trackVersions.status, 'processing'), lt(trackVersions.updatedAt, before)))
      .orderBy(asc(trackVersions.id))
      .limit(limit),
    db
      .select({ id: projectCovers.id })
      .from(projectCovers)
      .where(and(eq(projectCovers.status, 'processing'), lt(projectCovers.updatedAt, before)))
      .orderBy(asc(projectCovers.id))
      .limit(limit),
    db
      .select({ id: avatars.id })
      .from(avatars)
      .where(and(eq(avatars.status, 'processing'), lt(avatars.updatedAt, before)))
      .orderBy(asc(avatars.id))
      .limit(limit),
  ]);
  return {
    versions: versions.map((row) => row.id),
    covers: covers.map((row) => row.id),
    avatars: avatarRows.map((row) => row.id),
  };
}
