// Pure permission logic. No I/O: callers pass already-loaded data in and get a decision back.
// Every authorization decision goes through canAccess() (CLAUDE.md section 6, rule 2).

/** Narrowest first: each level lets in everyone the one before it does, and more. */
export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ROLES = ['owner', 'comment', 'listen'] as const;
export type Role = (typeof ROLES)[number];

/** The roles a share link can carry. Ownership is never handed out by link. */
export const LINK_ROLES = ['comment', 'listen'] as const satisfies readonly Role[];
export type LinkRole = (typeof LINK_ROLES)[number];

export const ACTIONS = ['view', 'listen', 'comment', 'manage', 'download'] as const;
export type Action = (typeof ACTIONS)[number];

/** Who is asking. Anonymous actors have no session. */
export type Actor = { kind: 'anonymous' } | { kind: 'user'; userId: string };

export const RESOURCE_KINDS = ['project', 'track'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/**
 * What they're asking about, with its effective visibility already worked out by the caller (for
 * a track, `effectiveVisibility`).
 */
export interface Resource {
  kind: ResourceKind;
  ownerId: string;
  visibility: Visibility;
}

/**
 * A share link presented with the request, already looked up by its token's hash and matched to
 * the resource: made for it, or for the project a requested track is in.
 */
export interface ShareLinkGrant {
  role: LinkRole;
  expiresAt: Date | null;
  revokedAt: Date | null;
  /**
   * The effective visibility of what the link was made for. For a link made for the resource
   * itself, the same as `resource.visibility`; for a project's link used on one of its tracks,
   * the project's.
   */
  sharedVisibility: Visibility;
}

export interface AccessContext {
  link: ShareLinkGrant;
  /** The time to judge the link's expiry against. */
  now: Date;
}

/** What each role may do. Downloads stay owner-only until there's a per-project setting (rule 4). */
const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  owner: ACTIONS,
  comment: ['view', 'listen', 'comment'],
  listen: ['view', 'listen'],
};

/** Actions that need a signed-in actor whatever their role: a comment needs an author. */
const SIGNED_IN_ONLY: readonly Action[] = ['comment', 'manage', 'download'];

function rank(visibility: Visibility): number {
  return VISIBILITIES.indexOf(visibility);
}

/** Whether `a` lets in more people than `b`. */
export function isWider(a: Visibility, b: Visibility): boolean {
  return rank(a) > rank(b);
}

/** The narrower of two visibilities. */
export function narrowest(a: Visibility, b: Visibility): Visibility {
  return isWider(a, b) ? b : a;
}

/**
 * A track's effective visibility (rule 7): a loose track's own; in a project, its override if it
 * has one, otherwise the project's.
 */
export function effectiveVisibility(
  track: { visibility: Visibility; visibilityOverride: Visibility | null },
  project: { visibility: Visibility } | null,
): Visibility {
  if (!project) return track.visibility;
  return track.visibilityOverride ?? project.visibility;
}

/**
 * The override a track gets when it joins a project, so joining never lets more people hear it:
 * its current effective visibility when that's narrower than the project's, otherwise none (it
 * inherits the project's, which is the same or narrower).
 */
export function overrideOnJoin(current: Visibility, project: Visibility): Visibility | null {
  return isWider(project, current) ? current : null;
}

/** Whether a share link still works at `now`: not revoked, and not at or past its expiry. */
export function isLinkActive(link: Pick<ShareLinkGrant, 'expiresAt' | 'revokedAt'>, now: Date) {
  if (link.revokedAt) return false;
  return !link.expiresAt || now.getTime() < link.expiresAt.getTime();
}

/** The role `actor` has on `resource`, or null for none. */
export function roleFor(actor: Actor, resource: Resource, context?: AccessContext): Role | null {
  if (actor.kind === 'user' && actor.userId === resource.ownerId) return 'owner';

  const roles: LinkRole[] = [];
  // Public: anyone can listen; a signed-in user can also comment.
  if (resource.visibility === 'public') roles.push(actor.kind === 'user' ? 'comment' : 'listen');
  // A link works only while active, and only if neither what it was made for nor what's asked
  // for is private: making something private shuts its links off without revoking them.
  if (
    context &&
    isLinkActive(context.link, context.now) &&
    resource.visibility !== 'private' &&
    context.link.sharedVisibility !== 'private'
  ) {
    roles.push(context.link.role);
  }
  if (roles.includes('comment')) return 'comment';
  return roles.includes('listen') ? 'listen' : null;
}

/**
 * Whether `actor` may perform `action` on `resource` (CLAUDE.md section 6).
 *
 * - The owner may do anything.
 * - `public`: anyone may view and listen; signed-in users may also comment.
 * - `unlisted`: only holders of an active share link, with the link's role.
 * - `private`: the owner only. Links do nothing.
 * - Commenting, managing and downloading always need a signed-in actor; managing and downloading
 *   need the owner.
 */
export function canAccess(
  actor: Actor,
  resource: Resource,
  action: Action,
  context?: AccessContext,
): boolean {
  const role = roleFor(actor, resource, context);
  if (!role) return false;
  if (actor.kind === 'anonymous' && SIGNED_IN_ONLY.includes(action)) return false;
  return ROLE_ACTIONS[role].includes(action);
}
