import { and, desc, eq, exists, inArray, isNull, lt, max, ne, or, sql } from 'drizzle-orm';
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

/**
 * Adds the next version (`uploading`) to a live track. Numbers count up and are never reused: a
 * failed or abandoned v3 stays v3, so this one is v4. The track row is locked while the number is
 * picked, so two uploads at once get different numbers. Null if the track doesn't exist or was
 * deleted.
 */
export async function createNextVersion(
  db: Db,
  input: { trackId: string; original: NewOriginal; changeNotes?: string | null },
): Promise<TrackVersion | null> {
  return db.transaction(async (tx) => {
    // `no key update`: the version insert's foreign key check on the track isn't blocked by it.
    const [track] = await tx
      .select({ id: tracks.id })
      .from(tracks)
      .where(and(eq(tracks.id, input.trackId), isNull(tracks.deletedAt)))
      .for('no key update');
    if (!track) return null;

    const [last] = await tx
      .select({ versionNumber: max(trackVersions.versionNumber) })
      .from(trackVersions)
      .where(eq(trackVersions.trackId, track.id));
    const versionId = uuidv7();
    const [version] = await tx
      .insert(trackVersions)
      .values({
        id: versionId,
        trackId: track.id,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        changeNotes: input.changeNotes ?? null,
        originalKey: `originals/${versionId}`,
        originalFilename: input.original.filename,
        originalContentType: input.original.contentType,
        originalSizeBytes: input.original.sizeBytes,
      })
      .returning();
    if (!version) throw new Error('insert returned no version');
    return version;
  });
}

/**
 * Sets a version's change notes or feedback prompt (the ones given; null clears one). The audio
 * of a ready version never changes; its words are the artist's to fix. Null if the version
 * doesn't exist.
 */
export async function updateVersionText(
  db: Db,
  versionId: string,
  changes: { changeNotes?: string | null; feedbackPrompt?: string | null },
): Promise<TrackVersion | null> {
  const [version] = await db
    .update(trackVersions)
    .set(changes)
    .where(eq(trackVersions.id, versionId))
    .returning();
  return version ?? null;
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
 *
 * A track whose versions are all still `uploading` isn't listed: its file never arrived (the tab
 * closed or the upload failed), so it has nothing to play or retry. Phase 7 cleans those up.
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
        exists(
          db
            .select({ id: trackVersions.id })
            .from(trackVersions)
            .where(
              and(eq(trackVersions.trackId, tracks.id), ne(trackVersions.status, 'uploading')),
            ),
        ),
      ),
    )
    .orderBy(desc(tracks.id))
    .limit(limit);
  return withLatestVersions(db, page);
}

/**
 * Pairs each track with its newest version, keeping the tracks' order. A version whose file
 * never arrived (`uploading`) only counts when there's nothing newer that did, so an abandoned
 * v2 upload doesn't hide a ready v1.
 */
export async function withLatestVersions(
  db: Db,
  list: Track[],
): Promise<{ track: Track; latestVersion: VersionSummary }[]> {
  if (list.length === 0) return [];

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
        list.map((t) => t.id),
      ),
    )
    .orderBy(
      trackVersions.trackId,
      sql`${trackVersions.status} = 'uploading'`,
      desc(trackVersions.versionNumber),
    );
  const byTrack = new Map(latest.map(({ trackId, ...version }) => [trackId, version]));

  // Every track is created with its v1 in one transaction, so each has a latest version.
  return list.flatMap((track) => {
    const latestVersion = byTrack.get(track.id);
    return latestVersion ? [{ track, latestVersion }] : [];
  });
}

/**
 * Pairs each track with its current version (the newest `ready` one), keeping the tracks' order
 * and leaving out tracks with none: what a listener sees, where `withLatestVersions` is what the
 * artist sees.
 */
export async function withCurrentVersions(
  db: Db,
  list: Track[],
): Promise<{ track: Track; latestVersion: VersionSummary }[]> {
  const ids = list.flatMap((t) => (t.currentVersionId ? [t.currentVersionId] : []));
  if (ids.length === 0) return [];

  const current = await db
    .select({
      id: trackVersions.id,
      versionNumber: trackVersions.versionNumber,
      status: trackVersions.status,
      durationMs: trackVersions.durationMs,
    })
    .from(trackVersions)
    .where(and(inArray(trackVersions.id, ids), eq(trackVersions.status, 'ready')));
  const byId = new Map(current.map((version) => [version.id, version]));
  return list.flatMap((track) => {
    const latestVersion = track.currentVersionId ? byId.get(track.currentVersionId) : undefined;
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
