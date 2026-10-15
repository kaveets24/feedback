import { describe, expect, it } from 'vitest';
import { ACTIONS, canAccess, VISIBILITIES, type Actor } from './index.ts';

const OWNER_ID = 'user-owner';

const actors: Record<string, Actor> = {
  owner: { kind: 'user', userId: OWNER_ID },
  stranger: { kind: 'user', userId: 'user-stranger' },
  anonymous: { kind: 'anonymous' },
};

// Phase 2: only the owner gets in. Phase 4 adds grantee and link-holder rows and opens up
// shared, unlisted and public resources.
const expected = (actor: string) => actor === 'owner';

const cases = VISIBILITIES.flatMap((visibility) =>
  ACTIONS.flatMap((action) =>
    Object.keys(actors).map((actor) => ({ visibility, action, actor, allowed: expected(actor) })),
  ),
);

describe('canAccess (Phase 2: owner only)', () => {
  it.each(cases)('$actor $action on a $visibility track: $allowed', (c) => {
    const resource = { kind: 'track', ownerId: OWNER_ID, visibility: c.visibility } as const;
    expect(canAccess(actors[c.actor]!, resource, c.action)).toBe(c.allowed);
  });

  it('covers every visibility, action and actor', () => {
    expect(cases).toHaveLength(VISIBILITIES.length * ACTIONS.length * 3);
  });
});
