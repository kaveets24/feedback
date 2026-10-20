import {
  canAccess,
  effectiveVisibility,
  type Actor as AuthzActor,
  type Resource,
} from '@feedback/authz';
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
 * A track as a `canAccess` resource, with its effective visibility (CLAUDE.md section 6, rule 7):
 * pass the live project it's in, or null for a loose track.
 */
export function trackResource(track: Track, project: Project | null): Resource {
  return {
    kind: 'track',
    ownerId: track.ownerId,
    visibility: effectiveVisibility(track, project),
  };
}

/**
 * Whether the actor may manage the resource, i.e. is its owner: what decides whether a response
 * carries owner-only details (file names, notes, versions that aren't ready). Goes through
 * `canAccess`, like every other decision.
 */
export function canManage(actor: Actor, resource: Resource): boolean {
  return canAccess(authzActor(actor), resource, 'manage');
}
