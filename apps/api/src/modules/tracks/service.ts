import { canAccess, effectiveVisibility, type Action } from '@feedback/authz';
import {
  findProject,
  findProjectsByIds,
  findTrack,
  listTracksForOwner,
  listVersions,
  setTrackVisibility,
  type Db,
  type Project,
  type Track,
  type VersionSummary,
} from '@feedback/db';
import {
  TRACK_LIST_DEFAULT_LIMIT,
  type TrackListResponse,
  type TrackResponse,
  type TrackSummary,
  type UpdateTrackRequest,
} from '@feedback/shared';
import { authzActor, canManage, projectResource, trackResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { toVersionResponse } from '../versions/service.ts';

/** The fields a track shows everyone who may view it, given the live project it's in (if any). */
function trackFields(actor: Actor, track: Track, project: Project | null) {
  const seesProject =
    project !== null && canAccess(authzActor(actor), projectResource(project), 'view');
  return {
    id: track.id,
    title: track.title,
    projectId: seesProject ? project.id : null,
    visibility: effectiveVisibility(track, project),
    inheritsVisibility: project !== null && track.visibilityOverride === null,
    createdAt: track.createdAt.toISOString(),
    currentVersionId: track.currentVersionId,
  };
}

/**
 * Tracks for a list, keeping only those the actor may view. `projects` holds the live projects
 * the tracks are in, for their effective visibility. The caller pairs each track with the version
 * the actor should see: the newest for the owner, the current one for anyone else.
 */
export function toTrackSummaries(
  actor: Actor,
  rows: { track: Track; latestVersion: VersionSummary }[],
  projects: Map<string, Project>,
): TrackSummary[] {
  const who = authzActor(actor);
  return rows.flatMap(({ track, latestVersion }) => {
    const project = (track.projectId && projects.get(track.projectId)) || null;
    if (!canAccess(who, trackResource(track, project), 'view')) return [];
    return [{ ...trackFields(actor, track, project), latestVersion }];
  });
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
  const projects = await findProjectsByIds(
    db,
    page.flatMap(({ track }) => (track.projectId ? [track.projectId] : [])),
  );
  return {
    tracks: toTrackSummaries(actor, page, projects),
    nextCursor: rows.length > limit ? (page.at(-1)?.track.id ?? null) : null,
  };
}

/**
 * A track and the live project it's in, if the actor may perform `action` on the track (judged
 * by its effective visibility). Anything else, including a track that exists but isn't theirs, is
 * a 404, so existence never leaks (CLAUDE.md section 6, rule 9).
 */
export async function loadTrackAccess(
  db: Db,
  actor: Actor,
  trackId: string,
  action: Action,
): Promise<{ track: Track; project: Project | null }> {
  const track = await findTrack(db, trackId);
  const project = track?.projectId ? await findProject(db, track.projectId) : null;
  if (!track || !canAccess(authzActor(actor), trackResource(track, project), action)) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return { track, project };
}

/** A track, if the actor may perform `action` on it; else the usual 404. */
export async function loadTrackFor(
  db: Db,
  actor: Actor,
  trackId: string,
  action: Action,
): Promise<Track> {
  return (await loadTrackAccess(db, actor, trackId, action)).track;
}

/**
 * A track with its versions. The owner sees everything; anyone else only the ready versions, and
 * no notes or file names.
 */
async function toTrackResponse(
  db: Db,
  actor: Actor,
  track: Track,
  project: Project | null,
): Promise<TrackResponse> {
  const owner = canManage(actor, trackResource(track, project));
  const versions = await listVersions(db, track.id);
  return {
    ...trackFields(actor, track, project),
    notes: owner ? track.notes : null,
    versions: versions
      .filter((version) => owner || version.status === 'ready')
      .map((version) => toVersionResponse(version, owner)),
  };
}

/** A track and its versions, or a 404 for anyone who may not view it. */
export async function getTrack(db: Db, actor: Actor, trackId: string): Promise<TrackResponse> {
  const { track, project } = await loadTrackAccess(db, actor, trackId, 'view');
  return toTrackResponse(db, actor, track, project);
}

/** Sets who can hear a track (owner only); see `updateTrackRequestSchema`. */
export async function updateTrack(
  db: Db,
  actor: Actor,
  trackId: string,
  input: UpdateTrackRequest,
): Promise<TrackResponse> {
  await loadTrackAccess(db, actor, trackId, 'manage');
  const result = await setTrackVisibility(db, trackId, input.visibility);
  if (!result.ok && result.reason === 'not-in-project') {
    throw httpError(
      409,
      'TRACK_NOT_IN_PROJECT',
      'This track isn’t in a project, so it has no project visibility to follow',
    );
  }
  // Not found only if it was deleted since the check above.
  if (!result.ok) throw httpError(404, 'NOT_FOUND', 'Not found');
  const { track } = result;
  const project = track.projectId ? await findProject(db, track.projectId) : null;
  return toTrackResponse(db, actor, track, project);
}
