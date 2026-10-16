import type { Actor as AuthzActor, Resource } from '@feedback/authz';
import type { Track } from '@feedback/db';
import type { Actor } from './plugin.ts';

/** The request's actor in the shape `canAccess` takes. */
export function authzActor(actor: Actor): AuthzActor {
  return actor.kind === 'user' ? { kind: 'user', userId: actor.user.id } : actor;
}

/**
 * A track as a `canAccess` resource. Every track is loose (no project) until Phase 3, so its
 * effective visibility is its own (CLAUDE.md section 6, rule 7).
 */
export function trackResource(track: Track): Resource {
  return { kind: 'track', ownerId: track.ownerId, visibility: track.visibility };
}
