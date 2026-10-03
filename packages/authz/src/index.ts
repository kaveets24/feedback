// Pure permission logic. No I/O: callers pass already-loaded data in and get a decision back.
// canAccess() and its exhaustive table-driven tests land in Phase 3 (see CLAUDE.md section 6).

export const VISIBILITIES = ['private', 'shared', 'unlisted', 'public'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const ROLES = ['owner', 'comment', 'listen'] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = ['view', 'listen', 'comment', 'manage', 'download'] as const;
export type Action = (typeof ACTIONS)[number];
