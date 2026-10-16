import { canAccess, type Action } from '@feedback/authz';
import { findVersion, type Db, type Track, type TrackVersion } from '@feedback/db';
import type { VersionResponse } from '@feedback/shared';
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
  };
}

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
