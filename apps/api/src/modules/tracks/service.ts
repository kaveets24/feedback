import { canAccess, type Action } from '@feedback/authz';
import {
  findTrack,
  listTracksForOwner,
  listVersions,
  type Db,
  type Track,
  type VersionSummary,
} from '@feedback/db';
import {
  TRACK_LIST_DEFAULT_LIMIT,
  type TrackListResponse,
  type TrackResponse,
  type TrackSummary,
} from '@feedback/shared';
import { authzActor, trackResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { toVersionResponse } from '../versions/service.ts';

function trackFields(track: Track) {
  return {
    id: track.id,
    title: track.title,
    projectId: track.projectId,
    visibility: track.visibility,
    createdAt: track.createdAt.toISOString(),
    currentVersionId: track.currentVersionId,
  };
}

/** Tracks for a list, keeping only those the actor may view. */
export function toTrackSummaries(
  actor: Actor,
  rows: { track: Track; latestVersion: VersionSummary }[],
): TrackSummary[] {
  const who = authzActor(actor);
  // The queries already filter to the actor's own tracks; canAccess still makes the call, so
  // every decision goes through it (CLAUDE.md section 6, rule 2).
  return rows
    .filter(({ track }) => canAccess(who, trackResource(track), 'view'))
    .map(({ track, latestVersion }) => ({ ...trackFields(track), latestVersion }));
}

/** The signed-in user's tracks, newest first, a page at a time. */
export async function listMyTracks(
  db: Db,
  actor: Actor,
  { cursor, limit = TRACK_LIST_DEFAULT_LIMIT }: { cursor?: string; limit?: number },
): Promise<TrackListResponse> {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');

  // One extra row says whether there's another page.
  const rows = await listTracksForOwner(db, actor.user.id, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  return {
    tracks: toTrackSummaries(actor, page),
    nextCursor: rows.length > limit ? (page.at(-1)?.track.id ?? null) : null,
  };
}

/**
 * A track, if the actor may perform `action` on it. Anything else, including a track that exists
 * but isn't theirs, is a 404, so existence never leaks (CLAUDE.md section 6, rule 9).
 */
export async function loadTrackFor(
  db: Db,
  actor: Actor,
  trackId: string,
  action: Action,
): Promise<Track> {
  const track = await findTrack(db, trackId);
  if (!track || !canAccess(authzActor(actor), trackResource(track), action)) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return track;
}

/** A track and all its versions, or a 404 for anyone who may not view it. */
export async function getTrack(db: Db, actor: Actor, trackId: string): Promise<TrackResponse> {
  const track = await loadTrackFor(db, actor, trackId, 'view');
  const versions = await listVersions(db, track.id);
  return { ...trackFields(track), notes: track.notes, versions: versions.map(toVersionResponse) };
}
