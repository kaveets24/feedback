import type { Actor as AuthzActor, Resource } from '@feedback/authz';
import type { Project, Track } from '@feedback/db';
import type { Actor } from './plugin.ts';

/** The request's actor in the shape `canAccess` takes. */
export function authzActor(actor: Actor): AuthzActor {
  return actor.kind === 'user' ? { kind: 'user', userId: actor.user.id } : actor;
}

/** A project as a `canAccess` resource. */
export function projectResource(project: Project): Resource {
  return { kind: 'project', ownerId: project.ownerId, visibility: project.visibility };
}

/**
 * A track as a `canAccess` resource, with its own visibility. That's right for a loose track; for
 * one in a project, how the project's visibility and the override combine (CLAUDE.md section 6,
 * rule 7) is settled in Phase 4. It makes no difference until then: access is owner-only.
 */
export function trackResource(track: Track): Resource {
  return { kind: 'track', ownerId: track.ownerId, visibility: track.visibility };
}
