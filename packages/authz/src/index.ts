// Pure permission logic. No I/O: callers pass already-loaded data in and get a decision back.
// Every authorization decision goes through canAccess() (CLAUDE.md section 6, rule 2).

export const VISIBILITIES = ['private', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ROLES = ['owner', 'comment', 'listen'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = ['view', 'listen', 'comment', 'manage', 'download'] as const;
export type Action = (typeof ACTIONS)[number];

/** Who is asking. Anonymous actors have no session. */
export type Actor = { kind: 'anonymous' } | { kind: 'user'; userId: string };

export const RESOURCE_KINDS = ['project', 'track'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

/** What they're asking about, with its effective visibility already worked out by the caller. */
export interface Resource {
  kind: ResourceKind;
  ownerId: string;
  visibility: Visibility;
}

/**
 * Whether `actor` may perform `action` on `resource`.
 *
 * Until Phase 4 (everything is private): the owner may do anything, and everyone else is denied at
 * every visibility. Share links and public access arrive in Phase 4, with exhaustive
 * tests written first. Until then this fails closed.
 */
export function canAccess(actor: Actor, resource: Resource, _action: Action): boolean {
  return actor.kind === 'user' && actor.userId === resource.ownerId;
}
