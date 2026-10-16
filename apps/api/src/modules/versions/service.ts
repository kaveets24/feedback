import { canAccess, type Action } from '@feedback/authz';
import { findVersion, type Db, type Track, type TrackVersion } from '@feedback/db';
import type { StreamResponse, VersionResponse } from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { authzActor, trackResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';

export function toVersionResponse(version: TrackVersion): VersionResponse {
  return {
    id: version.id,
    trackId: version.trackId,
    versionNumber: version.versionNumber,
    status: version.status,
    failureReason: version.failureReason,
    durationMs: version.durationMs,
    waveformPeaks: version.waveformPeaks,
    createdAt: version.createdAt.toISOString(),
  };
}

/**
 * How long a playback URL lives (CLAUDE.md section 6, rule 5: 5 to 15 minutes; ADR 0008: 10).
 * A track can be longer than this, so the player fetches a new URL when one stops working.
 */
export const PLAYBACK_URL_SECONDS = 10 * 60;

/**
 * A version and its track, if the actor may perform `action` on the track. Anything else,
 * including a version that exists but isn't theirs, is a 404, so existence never leaks
 * (CLAUDE.md section 6, rule 9).
 */
export async function loadVersionFor(
  db: Db,
  actor: Actor,
  versionId: string,
  action: Action,
): Promise<{ track: Track; version: TrackVersion }> {
  const found = await findVersion(db, versionId);
  if (!found || !canAccess(authzActor(actor), trackResource(found.track), action)) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return found;
}

export async function getVersion(
  db: Db,
  actor: Actor,
  versionId: string,
): Promise<VersionResponse> {
  const { version } = await loadVersionFor(db, actor, versionId, 'view');
  return toVersionResponse(version);
}

/**
 * A short-lived URL for a ready version's stream file, issued only once `canAccess(..., 'listen')`
 * passes (CLAUDE.md section 6, rule 5). A version that isn't ready yet is a 409, but only to
 * someone who may listen to it; anyone else gets the usual 404.
 */
export async function getStream(
  { db, storage }: { db: Db; storage: Storage },
  actor: Actor,
  versionId: string,
): Promise<StreamResponse> {
  const { version } = await loadVersionFor(db, actor, versionId, 'listen');
  if (version.status !== 'ready' || !version.streamKey) {
    throw httpError(409, 'VERSION_NOT_READY', 'This version is not ready to play yet');
  }
  const url = await storage.presignDownload({
    key: version.streamKey,
    expiresIn: PLAYBACK_URL_SECONDS,
  });
  return { url, expiresAt: new Date(Date.now() + PLAYBACK_URL_SECONDS * 1000).toISOString() };
}
