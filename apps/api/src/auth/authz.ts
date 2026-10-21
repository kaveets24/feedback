import {
  canAccess,
  canAccessFeedback,
  effectiveVisibility,
  type AccessContext,
  type Action,
  type FeedbackAction,
  type FeedbackItem,
  type Resource,
  type Actor as AuthzActor,
  type ResourceKind,
  type Visibility,
} from '@feedback/authz';
import type { Project, Track } from '@feedback/db';
import type { Actor } from './plugin.ts';

/** The request's actor in the shape `canAccess` takes. */
export function authzActor(actor: Actor): AuthzActor {
  return actor.kind === 'user' ? { kind: 'user', userId: actor.user.id } : { kind: 'anonymous' };
}

/** Something a share link could have been made for, with its effective visibility. */
interface LinkTarget {
  kind: ResourceKind;
  id: string;
  visibility: Visibility;
}

/** The actor's share link as a `canAccess` context, if it was made for one of `targets`. */
function linkContext(actor: Actor, targets: LinkTarget[]): AccessContext | undefined {
  const link = actor.shareLink;
  if (!link) return undefined;
  const target = targets.find((t) => t.kind === link.resourceType && t.id === link.resourceId);
  if (!target) return undefined;
  return {
    link: {
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      sharedVisibility: target.visibility,
    },
    now: new Date(),
  };
}

/**
 * Whether the actor may perform `action` on a project, counting a share link made for it.
 */
export function canAccessProject(actor: Actor, project: Project, action: Action): boolean {
  const target = { kind: 'project', id: project.id, visibility: project.visibility } as const;
  return canAccess(
    authzActor(actor),
    { kind: 'project', ownerId: project.ownerId, visibility: project.visibility },
    action,
    linkContext(actor, [target]),
  );
}

/** A track as `canAccess` sees it, and the actor's share link for it or its project, if any. */
function trackAccess(
  actor: Actor,
  track: Track,
  project: Project | null,
): { resource: Resource; context: AccessContext | undefined } {
  const visibility = effectiveVisibility(track, project);
  const targets: LinkTarget[] = [{ kind: 'track', id: track.id, visibility }];
  if (project) targets.push({ kind: 'project', id: project.id, visibility: project.visibility });
  return {
    resource: { kind: 'track', ownerId: track.ownerId, visibility },
    context: linkContext(actor, targets),
  };
}

/**
 * Whether the actor may perform `action` on a track, judged by its effective visibility (CLAUDE.md
 * section 6, rule 7; pass the live project it's in, or null for a loose track), counting a share
 * link made for the track or for its project.
 */
export function canAccessTrack(
  actor: Actor,
  track: Track,
  project: Project | null,
  action: Action,
): boolean {
  const { resource, context } = trackAccess(actor, track, project);
  return canAccess(authzActor(actor), resource, action, context);
}

/** Whether the actor may perform `action` on a comment on one of this track's versions. */
export function canAccessTrackFeedback(
  actor: Actor,
  track: Track,
  project: Project | null,
  feedback: FeedbackItem,
  action: FeedbackAction,
): boolean {
  const { resource, context } = trackAccess(actor, track, project);
  return canAccessFeedback(authzActor(actor), resource, feedback, action, context);
}
