import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { statusesBefore } from '@feedback/shared';
import type { Db } from './client.ts';
import { tracks, trackVersions, type Track, type TrackVersion } from './schema.ts';

export interface NewOriginal {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * Creates a track and its v1 (`uploading`) in one transaction. The original's storage key is
 * derived from the version id (`originals/<versionId>`, ADR 0008).
 */
export async function createTrackWithFirstVersion(
  db: Db,
  input: { ownerId: string; title: string; original: NewOriginal },
): Promise<{ track: Track; version: TrackVersion }> {
  return db.transaction(async (tx) => {
    const [track] = await tx
      .insert(tracks)
      .values({ ownerId: input.ownerId, title: input.title })
      .returning();
    if (!track) throw new Error('insert returned no track');

    const versionId = uuidv7();
    const [version] = await tx
      .insert(trackVersions)
      .values({
        id: versionId,
        trackId: track.id,
        versionNumber: 1,
        originalKey: `originals/${versionId}`,
        originalFilename: input.original.filename,
        originalContentType: input.original.contentType,
        originalSizeBytes: input.original.sizeBytes,
      })
      .returning();
    if (!version) throw new Error('insert returned no version');
    return { track, version };
  });
}

/** A track by id, or null if it doesn't exist or was deleted. */
export async function findTrack(db: Db, trackId: string): Promise<Track | null> {
  const [track] = await db
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), isNull(tracks.deletedAt)));
  return track ?? null;
}

/** The newest version of a track, in any status, without its peaks (for lists). */
export type VersionSummary = Pick<TrackVersion, 'id' | 'versionNumber' | 'status' | 'durationMs'>;

/**
 * An owner's tracks, newest first, each with its newest version. Pages by id: ids are UUIDv7, so
 * they sort by creation time and compare exactly, unlike a timestamp truncated to milliseconds.
 * Pass the last id of one page as `before` to get the next.
 */
export async function listTracksForOwner(
  db: Db,
  ownerId: string,
  { limit, before }: { limit: number; before?: string },
): Promise<{ track: Track; latestVersion: VersionSummary }[]> {
  const page = await db
    .select()
    .from(tracks)
    .where(
      and(
        eq(tracks.ownerId, ownerId),
        isNull(tracks.deletedAt),
        before ? lt(tracks.id, before) : undefined,
      ),
    )
    .orderBy(desc(tracks.id))
    .limit(limit);
  if (page.length === 0) return [];

  const latest = await db
    .selectDistinctOn([trackVersions.trackId], {
      trackId: trackVersions.trackId,
      id: trackVersions.id,
      versionNumber: trackVersions.versionNumber,
      status: trackVersions.status,
      durationMs: trackVersions.durationMs,
    })
    .from(trackVersions)
    .where(
      inArray(
        trackVersions.trackId,
        page.map((t) => t.id),
      ),
    )
    .orderBy(trackVersions.trackId, desc(trackVersions.versionNumber));
  const byTrack = new Map(latest.map(({ trackId, ...version }) => [trackId, version]));

  // Every track is created with its v1 in one transaction, so each has a latest version.
  return page.flatMap((track) => {
    const latestVersion = byTrack.get(track.id);
    return latestVersion ? [{ track, latestVersion }] : [];
  });
}

/** A track's versions, newest first. */
export async function listVersions(db: Db, trackId: string): Promise<TrackVersion[]> {
  return db
    .select()
    .from(trackVersions)
    .where(eq(trackVersions.trackId, trackId))
    .orderBy(desc(trackVersions.versionNumber));
}

/** A version and its track, or null if either doesn't exist or the track was deleted. */
export async function findVersion(
  db: Db,
  versionId: string,
): Promise<{ track: Track; version: TrackVersion } | null> {
  const [row] = await db
    .select({ track: tracks, version: trackVersions })
    .from(trackVersions)
    .innerJoin(tracks, eq(tracks.id, trackVersions.trackId))
    .where(and(eq(trackVersions.id, versionId), isNull(tracks.deletedAt)));
  return row ?? null;
}

// The status updates below are compare-and-set: they only apply when the version is in a status
// that may move to the new one, and return null otherwise. Repeated or concurrent calls (a double
// "complete", a retried job) are therefore harmless.

/** `uploading -> processing`, once the upload is confirmed. */
export async function markVersionProcessing(
  db: Db,
  versionId: string,
): Promise<TrackVersion | null> {
  const [version] = await db
    .update(trackVersions)
    .set({ status: 'processing' })
    .where(
      and(
        eq(trackVersions.id, versionId),
        inArray(trackVersions.status, statusesBefore('processing')),
      ),
    )
    .returning();
  return version ?? null;
}

/** Marks a version failed with a reason the artist will see. */
export async function markVersionFailed(
  db: Db,
  versionId: string,
  reason: string,
): Promise<TrackVersion | null> {
  const [version] = await db
    .update(trackVersions)
    .set({ status: 'failed', failureReason: reason })
    .where(
      and(eq(trackVersions.id, versionId), inArray(trackVersions.status, statusesBefore('failed'))),
    )
    .returning();
  return version ?? null;
}

/**
 * `processing -> ready` with the worker's outputs. Also makes it the track's current version,
 * unless the track already points at a newer one.
 */
export async function markVersionReady(
  db: Db,
  versionId: string,
  output: { streamKey: string; durationMs: number; peaks: number[] },
): Promise<TrackVersion | null> {
  return db.transaction(async (tx) => {
    const [version] = await tx
      .update(trackVersions)
      .set({
        status: 'ready',
        streamKey: output.streamKey,
        durationMs: output.durationMs,
        waveformPeaks: output.peaks,
      })
      .where(
        and(
          eq(trackVersions.id, versionId),
          inArray(trackVersions.status, statusesBefore('ready')),
        ),
      )
      .returning();
    if (!version) return null;

    const current = tx
      .select({ versionNumber: trackVersions.versionNumber })
      .from(trackVersions)
      .where(eq(trackVersions.id, tracks.currentVersionId));
    await tx
      .update(tracks)
      .set({ currentVersionId: version.id })
      .where(
        and(
          eq(tracks.id, version.trackId),
          or(isNull(tracks.currentVersionId), lt(sql`(${current})`, version.versionNumber)),
        ),
      );
    return version;
  });
}
