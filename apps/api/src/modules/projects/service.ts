import type { Action } from '@feedback/authz';
import {
  createProject as insertProject,
  deleteProject as softDeleteProject,
  findProject,
  listProjectsForOwner,
  listProjectTracks,
  moveTrackToProject,
  reorderProjectTracks as saveTrackOrder,
  updateProject as saveProject,
  withCurrentVersions,
  withLatestVersions,
  type Db,
  type Project,
  type ProjectChanges,
  type Track,
  type User,
} from '@feedback/db';
import {
  PROJECT_LIST_DEFAULT_LIMIT,
  type CoverImage,
  type CreateProjectRequest,
  type ProjectDetailResponse,
  type ProjectListResponse,
  type ProjectResponse,
  type ProjectTracksResponse,
  type UpdateProjectRequest,
} from '@feedback/shared';
import { canAccessProject } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { coverImages, pendingCoverUpload, type CoverDeps } from '../covers/images.ts';
import { loadTrackFor, toTrackSummaries } from '../tracks/service.ts';

export function toProjectResponse(project: Project, cover: CoverImage | null): ProjectResponse {
  return {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    visibility: project.visibility,
    cover,
    createdAt: project.createdAt.toISOString(),
  };
}

/** A project as the API returns it, with a signed URL for its cover if it has one. */
async function respond(deps: CoverDeps, project: Project): Promise<ProjectResponse> {
  const covers = await coverImages(deps, [project]);
  return toProjectResponse(project, covers.get(project.id) ?? null);
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
  if (!project || !canAccessProject(actor, project, action)) {
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
  // New projects have no cover yet.
  return toProjectResponse(project, null);
}

/** The signed-in user's projects, newest first, a page at a time. */
export async function listMyProjects(
  deps: CoverDeps,
  actor: Actor,
  { cursor, limit = PROJECT_LIST_DEFAULT_LIMIT }: { cursor?: string; limit?: number },
): Promise<ProjectListResponse> {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');

  // One extra row says whether there's another page.
  const rows = await listProjectsForOwner(deps.db, actor.user.id, {
    limit: limit + 1,
    before: cursor,
  });
  const page = rows.slice(0, limit);
  // As with tracks, the query already filters to the actor's own; canAccess still decides, and
  // covers are signed only for projects that pass.
  const visible = page.filter((project) => canAccessProject(actor, project, 'view'));
  const covers = await coverImages(deps, visible);
  return {
    projects: visible.map((project) => toProjectResponse(project, covers.get(project.id) ?? null)),
    nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
  };
}

/**
 * A project, with its cover, and for the owner any cover upload still processing or that failed.
 */
export async function getProject(
  deps: CoverDeps,
  actor: Actor,
  projectId: string,
): Promise<ProjectDetailResponse> {
  const project = await loadProjectFor(deps.db, actor, projectId, 'view');
  const owner = canAccessProject(actor, project, 'manage');
  const [response, coverUpload] = await Promise.all([
    respond(deps, project),
    owner ? pendingCoverUpload(deps.db, project) : null,
  ]);
  return { ...response, coverUpload };
}

export async function updateProject(
  deps: CoverDeps,
  actor: Actor,
  projectId: string,
  input: UpdateProjectRequest,
): Promise<ProjectResponse> {
  await loadProjectFor(deps.db, actor, projectId, 'manage');
  const changes: ProjectChanges = {};
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = description(input.description);
  if (input.status !== undefined) changes.status = input.status;
  if (input.visibility !== undefined) changes.visibility = input.visibility;

  // Null only if it was deleted since the check above.
  const project = await saveProject(deps.db, projectId, changes);
  if (!project) throw httpError(404, 'NOT_FOUND', 'Not found');
  return respond(deps, project);
}

/** Soft-deletes the project and leaves its tracks loose. */
export async function deleteProject(db: Db, actor: Actor, projectId: string): Promise<void> {
  await loadProjectFor(db, actor, projectId, 'manage');
  if (!(await softDeleteProject(db, projectId))) throw httpError(404, 'NOT_FOUND', 'Not found');
}

/**
 * A project's tracks for the actor: every track with its newest version for the owner; for
 * anyone else, the tracks they may view that have a ready version, with that version.
 */
async function trackList(
  db: Db,
  actor: Actor,
  project: Project,
  list?: Track[],
): Promise<ProjectTracksResponse> {
  const tracks = list ?? (await listProjectTracks(db, project.id));
  const rows = canAccessProject(actor, project, 'manage')
    ? await withLatestVersions(db, tracks)
    : await withCurrentVersions(db, tracks);
  return { tracks: toTrackSummaries(actor, rows, new Map([[project.id, project]])) };
}

/** A project's tracks in order. */
export async function getProjectTracks(
  db: Db,
  actor: Actor,
  projectId: string,
): Promise<ProjectTracksResponse> {
  const project = await loadProjectFor(db, actor, projectId, 'view');
  return trackList(db, actor, project);
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
  const project = await loadProjectFor(db, actor, projectId, 'manage');
  await loadTrackFor(db, actor, trackId, 'manage');
  // Null only if either was deleted since the checks above.
  if (!(await moveTrackToProject(db, trackId, projectId))) {
    throw httpError(404, 'NOT_FOUND', 'Not found');
  }
  return trackList(db, actor, project);
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
  const project = await loadProjectFor(db, actor, projectId, 'manage');
  const result = await saveTrackOrder(db, projectId, trackIds);
  if (!result.ok && result.reason === 'not-found') throw httpError(404, 'NOT_FOUND', 'Not found');
  if (!result.ok) {
    throw httpError(
      409,
      'STALE_TRACK_ORDER',
      "The project's tracks changed since they were loaded. Reload and try again.",
    );
  }
  return trackList(db, actor, project, result.tracks);
}
