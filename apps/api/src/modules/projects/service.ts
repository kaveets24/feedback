import { canAccess, type Action } from '@feedback/authz';
import {
  createProject as insertProject,
  deleteProject as softDeleteProject,
  findProject,
  listProjectsForOwner,
  listProjectTracks,
  moveTrackToProject,
  reorderProjectTracks as saveTrackOrder,
  updateProject as saveProject,
  withLatestVersions,
  type Db,
  type Project,
  type ProjectChanges,
  type User,
} from '@feedback/db';
import {
  PROJECT_LIST_DEFAULT_LIMIT,
  type CreateProjectRequest,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectTracksResponse,
  type UpdateProjectRequest,
} from '@feedback/shared';
import { authzActor, projectResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { loadTrackFor, toTrackSummaries } from '../tracks/service.ts';

export function toProjectResponse(project: Project): ProjectResponse {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    visibility: project.visibility,
    createdAt: project.createdAt.toISOString(),
  };
}

/** A blank description is stored as none. */
const description = (value: string | null | undefined) =>
  value === undefined ? undefined : value || null;

/**
 * A project, if the actor may perform `action` on it. Anything else, including a project that
 * exists but isn't theirs, is a 404, so existence never leaks (CLAUDE.md section 6, rule 9).
 */
export async function loadProjectFor(
  db: Db,
  actor: Actor,
  projectId: string,
  action: Action,
): Promise<Project> {
  const project = await findProject(db, projectId);
  if (!project || !canAccess(authzActor(actor), projectResource(project), action)) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return project;
}

/** Creates a private project for `owner`. */
export async function createProject(
  db: Db,
  owner: User,
  input: CreateProjectRequest,
): Promise<ProjectResponse> {
  const project = await insertProject(db, {
    ownerId: owner.id,
    title: input.title,
    description: description(input.description),
    status: input.status,
  });
  return toProjectResponse(project);
}

/** The signed-in user's projects, newest first, a page at a time. */
export async function listMyProjects(
  db: Db,
  actor: Actor,
  { cursor, limit = PROJECT_LIST_DEFAULT_LIMIT }: { cursor?: string; limit?: number },
): Promise<ProjectListResponse> {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');

  // One extra row says whether there's another page.
  const rows = await listProjectsForOwner(db, actor.user.id, { limit: limit + 1, before: cursor });
  const page = rows.slice(0, limit);
  const who = authzActor(actor);
  return {
    // As with tracks, the query already filters to the actor's own; canAccess still decides.
    projects: page
      .filter((project) => canAccess(who, projectResource(project), 'view'))
      .map(toProjectResponse),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function getProject(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<ProjectResponse> {
  return toProjectResponse(await loadProjectFor(db, actor, projectId, 'view'));
}

export async function updateProject(
  db: Db,
  actor: Actor,
  projectId: string,
  input: UpdateProjectRequest,
): Promise<ProjectResponse> {
  await loadProjectFor(db, actor, projectId, 'manage');
  const changes: ProjectChanges = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = description(input.description);
  if (input.status !== undefined) changes.status = input.status;

  // Null only if it was deleted since the check above.
  const project = await saveProject(db, projectId, changes);
  if (!project) throw httpError(404, 'NOT_FOUND', 'Not found');
  return toProjectResponse(project);
}

/** Soft-deletes the project and leaves its tracks loose. */
export async function deleteProject(db: Db, actor: Actor, projectId: string): Promise<void> {
  await loadProjectFor(db, actor, projectId, 'manage');
  if (!(await softDeleteProject(db, projectId))) throw httpError(404, 'NOT_FOUND', 'Not found');
}

async function trackList(db: Db, actor: Actor, projectId: string): Promise<ProjectTracksResponse> {
  const rows = await withLatestVersions(db, await listProjectTracks(db, projectId));
  return { tracks: toTrackSummaries(actor, rows) };
}

/** A project's tracks in order. */
export async function getProjectTracks(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<ProjectTracksResponse> {
  await loadProjectFor(db, actor, projectId, 'view');
  return trackList(db, actor, projectId);
}

/**
 * Adds a track to the end of a project, moving it out of any other. Changing a project's tracks
 * takes `manage` on both the project and the track.
 */
export async function addProjectTrack(
  db: Db,
  actor: Actor,
  projectId: string,
  trackId: string,
): Promise<ProjectTracksResponse> {
  await loadProjectFor(db, actor, projectId, 'manage');
  await loadTrackFor(db, actor, trackId, 'manage');
  // Null only if either was deleted since the checks above.
  if (!(await moveTrackToProject(db, trackId, projectId))) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return trackList(db, actor, projectId);
}

/** Takes a track out of a project, leaving it loose. A 404 if it isn't in this project. */
export async function removeProjectTrack(
  db: Db,
  actor: Actor,
  projectId: string,
  trackId: string,
): Promise<void> {
  await loadProjectFor(db, actor, projectId, 'manage');
  await loadTrackFor(db, actor, trackId, 'manage');
  if (!(await moveTrackToProject(db, trackId, null, { from: projectId }))) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
}

/** Puts a project's tracks in a new order; see `reorderProjectTracksRequestSchema`. */
export async function reorderProjectTracks(
  db: Db,
  actor: Actor,
  projectId: string,
  trackIds: string[],
): Promise<ProjectTracksResponse> {
  // A project only ever holds its owner's tracks (the foreign key sees to it), so `manage` on the
  // project covers them.
  await loadProjectFor(db, actor, projectId, 'manage');
  const result = await saveTrackOrder(db, projectId, trackIds);
  if (!result.ok && result.reason === 'not-found') throw httpError(404, 'NOT_FOUND', 'Not found');
  if (!result.ok) {
    throw httpError(
      409,
      'STALE_TRACK_ORDER',
      "The project's tracks changed since they were loaded. Reload and try again.",
    );
  }
  return { tracks: toTrackSummaries(actor, await withLatestVersions(db, result.tracks)) };
}
