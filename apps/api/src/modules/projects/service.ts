import { canAccess, type Action } from '@feedback/authz';
import {
  createProject as insertProject,
  deleteProject as softDeleteProject,
  findProject,
  listProjectsForOwner,
  updateProject as saveProject,
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
  type UpdateProjectRequest,
} from '@feedback/shared';
import { authzActor, projectResource } from '../../auth/authz.ts';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';

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
