import { describe, expect, it } from 'vitest';
import { ACTIONS, canAccess, RESOURCE_KINDS, VISIBILITIES, type Actor } from './index.ts';

const OWNER_ID = 'user-owner';

const actors: Record<string, Actor> = {
  owner: { kind: 'user', userId: OWNER_ID },
  stranger: { kind: 'user', userId: 'user-stranger' },
  anonymous: { kind: 'anonymous' },
};

// Until Phase 4: only the owner gets in. Phase 4 adds link-holder rows and opens up unlisted and public
// resources.
const expected = (actor: string) => actor === 'owner';

const cases = RESOURCE_KINDS.flatMap((kind) =>
  VISIBILITIES.flatMap((visibility) =>
    ACTIONS.flatMap((action) =>
      Object.keys(actors).map((actor) => ({
        kind,
        visibility,
        action,
        actor,
        allowed: expected(actor),
      })),
    ),
  ),
);

describe('canAccess (until Phase 4: owner only)', () => {
  it.each(cases)('$actor $action on a $visibility $kind: $allowed', (c) => {
    const resource = { kind: c.kind, ownerId: OWNER_ID, visibility: c.visibility };
    expect(canAccess(actors[c.actor]!, resource, c.action)).toBe(c.allowed);
  });

  it('covers every resource kind, visibility, action and actor', () => {
    expect(cases).toHaveLength(
      RESOURCE_KINDS.length * VISIBILITIES.length * ACTIONS.length * Object.keys(actors).length,
    );
  });
});
