import { canAccess } from '@feedback/authz';
import { findTrack, listTracksForOwner, listVersions, type Db, type Track } from '@feedback/db';
import {
  TRACK_LIST_DEFAULT_LIMIT,
  type TrackListResponse,
  type TrackResponse,
} from '@feedback/shared';
import { authzActor, trackResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { toVersionResponse } from '../versions/service.ts';

function trackFields(track: Track) {
  return {
    id: track.id,
    title: track.title,
    visibility: track.visibility,
    createdAt: track.createdAt.toISOString(),
    currentVersionId: track.currentVersionId,
  };
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
  const who = authzActor(actor);
  return {
    // The query already filters to the actor's own tracks; canAccess still makes the call, so
    // every decision goes through it (CLAUDE.md section 6, rule 2).
    tracks: page
      .filter(({ track }) => canAccess(who, trackResource(track), 'view'))
      .map(({ track, latestVersion }) => ({ ...trackFields(track), latestVersion })),
    nextCursor: rows.length > limit ? (page.at(-1)?.track.id ?? null) : null,
  };
}

/** A track and all its versions, or a 404 for anyone who may not view it. */
export async function getTrack(db: Db, actor: Actor, trackId: string): Promise<TrackResponse> {
  const track = await findTrack(db, trackId);
  if (!track || !canAccess(authzActor(actor), trackResource(track), 'view')) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  const versions = await listVersions(db, track.id);
  return { ...trackFields(track), notes: track.notes, versions: versions.map(toVersionResponse) };
}
