import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  canAccess,
  canAccessFeedback,
  FEEDBACK_ACTIONS,
  effectiveVisibility,
  isLinkActive,
  isWider,
  narrowest,
  overrideOnJoin,
  RESOURCE_KINDS,
  roleFor,
  VISIBILITIES,
  type AccessContext,
  type Actor,
  type FeedbackItem,
  type Visibility,
} from './index.ts';

const OWNER_ID = 'user-owner';
const NOW = new Date('2026-10-20T12:00:00Z');
const owner: Actor = { kind: 'user', userId: OWNER_ID };
const stranger: Actor = { kind: 'user', userId: 'user-stranger' };
const anonymous: Actor = { kind: 'anonymous' };

/** An active link made for the resource itself. */
function link(visibility: Visibility, overrides = {}): AccessContext {
  return {
    link: { expiresAt: null, revokedAt: null, sharedVisibility: visibility, ...overrides },
    now: NOW,
  };
}

/** Each actor in the matrix: who they are, and the link they hold, if any. */
const ACTOR_CASES = {
  owner: { actor: owner, link: false },
  'owner with a link': { actor: owner, link: true },
  stranger: { actor: stranger, link: false },
  'stranger with a link': { actor: stranger, link: true },
  anonymous: { actor: anonymous, link: false },
  'anonymous with a link': { actor: anonymous, link: true },
} as const satisfies Record<string, { actor: Actor; link: boolean }>;
type ActorCase = keyof typeof ACTOR_CASES;

const ALL = 'view listen comment manage download';
const NONE = '';

/**
 * The permission matrix (CLAUDE.md section 6), written out by hand: what each actor may do at each
 * visibility. Change a cell only alongside the rule it encodes.
 */
const MATRIX: Record<Visibility, Record<ActorCase, string>> = {
  private: {
    owner: ALL,
    'owner with a link': ALL,
    stranger: NONE,
    'stranger with a link': NONE,
    anonymous: NONE,
    'anonymous with a link': NONE,
  },
  unlisted: {
    owner: ALL,
    'owner with a link': ALL,
    stranger: NONE,
    // If you can see it, you can give feedback on it...
    'stranger with a link': 'view listen comment',
    anonymous: NONE,
    // ...but commenting needs an account.
    'anonymous with a link': 'view listen',
  },
  public: {
    owner: ALL,
    'owner with a link': ALL,
    stranger: 'view listen comment',
    'stranger with a link': 'view listen comment',
    anonymous: 'view listen',
    'anonymous with a link': 'view listen',
  },
};

const matrixCases = RESOURCE_KINDS.flatMap((kind) =>
  VISIBILITIES.flatMap((visibility) =>
    (Object.keys(ACTOR_CASES) as ActorCase[]).flatMap((who) =>
      ACTIONS.map((action) => ({
        kind,
        visibility,
        who,
        action,
        allowed: MATRIX[visibility][who].split(' ').includes(action),
      })),
    ),
  ),
);

describe('canAccess: the permission matrix', () => {
  it.each(matrixCases)('$who: $action on a $visibility $kind → $allowed', (c) => {
    const { actor, link: hasLink } = ACTOR_CASES[c.who];
    const resource = { kind: c.kind, ownerId: OWNER_ID, visibility: c.visibility };
    const context = hasLink ? link(c.visibility) : undefined;
    expect(canAccess(actor, resource, c.action, context)).toBe(c.allowed);
  });

  it('covers every resource kind, visibility, actor and action', () => {
    expect(matrixCases).toHaveLength(
      RESOURCE_KINDS.length *
        VISIBILITIES.length *
        Object.keys(ACTOR_CASES).length *
        ACTIONS.length,
    );
  });

  it('never lets anyone but the owner manage or download', () => {
    const others = matrixCases.filter((c) => !c.who.startsWith('owner'));
    for (const c of others.filter((c) => c.action === 'manage' || c.action === 'download')) {
      expect(c.allowed, `${c.who} ${c.action} ${c.visibility}`).toBe(false);
    }
  });
});

describe('canAccess: a share link’s lifecycle', () => {
  const unlistedTrack = { kind: 'track', ownerId: OWNER_ID, visibility: 'unlisted' } as const;
  const minute = 60_000;
  const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

  it.each([
    { state: 'no expiry', expiresAt: null, revokedAt: null, works: true },
    { state: 'expires later', expiresAt: at(minute), revokedAt: null, works: true },
    { state: 'expires this instant', expiresAt: NOW, revokedAt: null, works: false },
    { state: 'expired', expiresAt: at(-minute), revokedAt: null, works: false },
    { state: 'revoked', expiresAt: null, revokedAt: at(-minute), works: false },
    {
      state: 'revoked before expiring',
      expiresAt: at(minute),
      revokedAt: at(-minute),
      works: false,
    },
  ])('$state: works → $works', ({ expiresAt, revokedAt, works }) => {
    const context = link('unlisted', { expiresAt, revokedAt });
    expect(isLinkActive(context.link, NOW)).toBe(works);
    for (const action of ['view', 'listen', 'comment'] as const) {
      expect(canAccess(stranger, unlistedTrack, action, context)).toBe(works);
    }
  });

  it('a dead link still leaves public access in place', () => {
    const publicTrack = { ...unlistedTrack, visibility: 'public' } as const;
    const context = link('public', { revokedAt: at(-minute) });
    expect(canAccess(anonymous, publicTrack, 'listen', context)).toBe(true);
  });
});

describe('canAccess: a project’s link used on one of its tracks', () => {
  /**
   * A stranger holding the project's link, by the project's visibility (rows) and the track's
   * effective visibility (columns): the link works only if neither is private.
   */
  const LISTEN: Record<Visibility, Record<Visibility, boolean>> = {
    private: { private: false, unlisted: false, public: true },
    unlisted: { private: false, unlisted: true, public: true },
    public: { private: false, unlisted: true, public: true },
  };
  const cases = VISIBILITIES.flatMap((projectVisibility) =>
    VISIBILITIES.map((trackVisibility) => ({
      projectVisibility,
      trackVisibility,
      allowed: LISTEN[projectVisibility][trackVisibility],
    })),
  );

  it.each(cases)(
    'project $projectVisibility, track $trackVisibility → $allowed',
    ({ projectVisibility, trackVisibility, allowed }) => {
      const track = { kind: 'track', ownerId: OWNER_ID, visibility: trackVisibility } as const;
      const context = link(projectVisibility);
      expect(canAccess(stranger, track, 'listen', context)).toBe(allowed);
      expect(canAccess(stranger, track, 'comment', context)).toBe(allowed);
    },
  );

  it('a public track is open whatever the link, but a link never lets anonymous comment', () => {
    const track = { kind: 'track', ownerId: OWNER_ID, visibility: 'public' } as const;
    expect(canAccess(anonymous, track, 'listen', link('private'))).toBe(true);
    expect(canAccess(anonymous, track, 'comment', link('unlisted'))).toBe(false);
  });
});

describe('roleFor', () => {
  const resource = (visibility: Visibility) =>
    ({ kind: 'project', ownerId: OWNER_ID, visibility }) as const;

  it.each([
    { who: 'owner', actor: owner, visibility: 'private', context: undefined, role: 'owner' },
    {
      who: 'stranger',
      actor: stranger,
      visibility: 'public',
      context: undefined,
      role: 'listener',
    },
    {
      who: 'anonymous',
      actor: anonymous,
      visibility: 'public',
      context: undefined,
      role: 'listener',
    },
    {
      who: 'stranger',
      actor: stranger,
      visibility: 'unlisted',
      context: undefined,
      role: null,
    },
    {
      who: 'anonymous with a link',
      actor: anonymous,
      visibility: 'unlisted',
      context: link('unlisted'),
      role: 'listener',
    },
    {
      who: 'stranger with a link',
      actor: stranger,
      visibility: 'private',
      context: link('private'),
      role: null,
    },
  ] as const)('$who on $visibility → $role', ({ actor, visibility, context, role }) => {
    expect(roleFor(actor, resource(visibility), context)).toBe(role);
  });
});

describe('effectiveVisibility (rule 7)', () => {
  it.each(VISIBILITIES)('a loose %s track keeps its own, ignoring any override', (own) => {
    for (const override of [null, ...VISIBILITIES]) {
      expect(effectiveVisibility({ visibility: own, visibilityOverride: override }, null)).toBe(
        own,
      );
    }
  });

  /** In a project: the override if set, else the project's. The track's own is ignored. */
  const IN_PROJECT: [project: Visibility, override: Visibility | null, effective: Visibility][] = [
    ['private', null, 'private'],
    ['unlisted', null, 'unlisted'],
    ['public', null, 'public'],
    ['public', 'private', 'private'],
    ['public', 'unlisted', 'unlisted'],
    ['unlisted', 'private', 'private'],
    // Wider than the project: only the owner sets overrides, so this is their explicit choice.
    ['private', 'unlisted', 'unlisted'],
    ['private', 'public', 'public'],
    ['unlisted', 'public', 'public'],
  ];
  it.each(IN_PROJECT)('project %s, override %s → %s', (project, override, effective) => {
    for (const own of VISIBILITIES) {
      expect(
        effectiveVisibility(
          { visibility: own, visibilityOverride: override },
          { visibility: project },
        ),
      ).toBe(effective);
    }
  });
});

describe('overrideOnJoin', () => {
  /** The override a track gets joining a project, by its visibility before and the project's. */
  const JOIN: [current: Visibility, project: Visibility, override: Visibility | null][] = [
    ['private', 'private', null],
    ['private', 'unlisted', 'private'],
    ['private', 'public', 'private'],
    ['unlisted', 'private', null],
    ['unlisted', 'unlisted', null],
    ['unlisted', 'public', 'unlisted'],
    ['public', 'private', null],
    ['public', 'unlisted', null],
    ['public', 'public', null],
  ];
  it.each(JOIN)('a %s track joining a %s project → override %s', (current, project, override) => {
    expect(overrideOnJoin(current, project)).toBe(override);
  });

  it('never leaves a track wider than it was', () => {
    for (const [current, project] of JOIN) {
      const after = effectiveVisibility(
        { visibility: current, visibilityOverride: overrideOnJoin(current, project) },
        { visibility: project },
      );
      expect(isWider(after, current), `${current} into ${project}`).toBe(false);
    }
  });
});

describe('isWider and narrowest', () => {
  it('order private < unlisted < public', () => {
    expect(isWider('public', 'unlisted')).toBe(true);
    expect(isWider('unlisted', 'private')).toBe(true);
    expect(isWider('private', 'public')).toBe(false);
    expect(isWider('unlisted', 'unlisted')).toBe(false);
    expect(narrowest('public', 'unlisted')).toBe('unlisted');
    expect(narrowest('private', 'public')).toBe('private');
    expect(narrowest('unlisted', 'unlisted')).toBe('unlisted');
  });
});

describe('canAccessFeedback', () => {
  const author: Actor = { kind: 'user', userId: 'user-author' };
  const comment: FeedbackItem = { authorId: 'user-author' };

  const FEEDBACK_ACTORS = {
    artist: owner,
    author,
    'other listener': stranger,
    anonymous,
  } as const satisfies Record<string, Actor>;
  type FeedbackActor = keyof typeof FEEDBACK_ACTORS;

  /**
   * What each person may do to the comment, given they can view the track. Written out by hand;
   * change a cell only alongside the rule it encodes (CLAUDE.md section 6, rules 8 and 11).
   */
  const FEEDBACK_MATRIX: Record<FeedbackActor, string> = {
    artist: 'read reply delete resolve',
    author: 'read reply edit delete',
    'other listener': 'read reply',
    // Reading needs no account; replying does.
    anonymous: 'read',
  };

  it.each(
    (Object.keys(FEEDBACK_ACTORS) as FeedbackActor[]).flatMap((who) =>
      FEEDBACK_ACTIONS.map((action) => ({ who, action })),
    ),
  )('on a public track: $who may $action?', ({ who, action }) => {
    const track = { kind: 'track' as const, ownerId: OWNER_ID, visibility: 'public' as const };
    const expected = FEEDBACK_MATRIX[who].split(' ').includes(action);
    expect(canAccessFeedback(FEEDBACK_ACTORS[who], track, comment, action)).toBe(expected);
  });

  // The same table holds at every track visibility, with or without a link, for whoever can view
  // the track; anyone who can't, the author included, gets nothing at all.
  it.each(
    VISIBILITIES.flatMap((trackVisibility) =>
      [false, true].flatMap((withLink) =>
        (Object.keys(FEEDBACK_ACTORS) as FeedbackActor[]).map((who) => ({
          trackVisibility,
          withLink,
          who,
        })),
      ),
    ),
  )('a $trackVisibility track (link: $withLink): $who', ({ trackVisibility, withLink, who }) => {
    const track = { kind: 'track' as const, ownerId: OWNER_ID, visibility: trackVisibility };
    const context = withLink ? link(trackVisibility) : undefined;
    const actor = FEEDBACK_ACTORS[who];
    const canView = canAccess(actor, track, 'view', context);
    const allowed = FEEDBACK_ACTIONS.filter((action) =>
      canAccessFeedback(actor, track, comment, action, context),
    ).join(' ');
    expect(allowed).toBe(canView ? FEEDBACK_MATRIX[who] : NONE);
  });

  it('shuts everything off when the link expires or is revoked, even for the author', () => {
    const track = { kind: 'track' as const, ownerId: OWNER_ID, visibility: 'unlisted' as const };
    expect(canAccessFeedback(author, track, comment, 'read', link('unlisted'))).toBe(true);
    for (const ended of [
      link('unlisted', { revokedAt: NOW }),
      link('unlisted', { expiresAt: NOW }),
    ]) {
      for (const action of FEEDBACK_ACTIONS) {
        expect(canAccessFeedback(author, track, comment, action, ended)).toBe(false);
      }
    }
  });

  it('lets the artist do everything to their own comment, even on a private track', () => {
    const track = { kind: 'track' as const, ownerId: OWNER_ID, visibility: 'private' as const };
    const allowed = FEEDBACK_ACTIONS.filter((action) =>
      canAccessFeedback(owner, track, { authorId: OWNER_ID }, action),
    ).join(' ');
    expect(allowed).toBe('read reply edit delete resolve');
  });
});
