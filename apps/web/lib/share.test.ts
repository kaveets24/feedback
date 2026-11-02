import { describe, expect, it } from 'vitest';
import type { ShareLinkResponse } from '@feedback/shared';
import { expiresAtFor, linkState, shareUrl, visibilitySentence } from './share';

const NOW = new Date('2026-10-20T12:00:00.000Z');

const link = (overrides: Partial<ShareLinkResponse> = {}): ShareLinkResponse => ({
  id: '01890a5d-ac96-774b-bcce-b302099a8058',
  resourceType: 'track',
  resourceId: '01890a5d-ac96-774b-bcce-b302099a8057',
  role: 'comment',
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-10-19T12:00:00.000Z',
  active: true,
  ...overrides,
});

describe('shareUrl', () => {
  it('puts the token in the fragment, never the path or query', () => {
    expect(shareUrl('https://app.test', 'tok_en-1')).toBe('https://app.test/listen#tok_en-1');
  });
});

describe('expiresAtFor', () => {
  it.each([
    ['never', null],
    ['1d', '2026-10-21T12:00:00.000Z'],
    ['7d', '2026-10-27T12:00:00.000Z'],
    ['30d', '2026-11-19T12:00:00.000Z'],
  ] as const)('%s → %s', (choice, expected) => {
    expect(expiresAtFor(choice, NOW)).toBe(expected);
  });
});

describe('linkState', () => {
  it.each([
    [link(), true, 'Never expires'],
    [link({ expiresAt: '2026-10-27T12:00:00.000Z' }), true, 'Works until October 27, 2026'],
    [link({ expiresAt: NOW.toISOString() }), false, 'Expired October 20, 2026'],
    [
      link({ revokedAt: '2026-10-19T13:00:00.000Z', expiresAt: '2026-10-27T12:00:00.000Z' }),
      false,
      'Turned off October 19, 2026',
    ],
  ])('%#: active %s, "%s"', (l, active, text) => {
    expect(linkState(l, NOW)).toEqual({ active, text });
  });
});

describe('visibilitySentence', () => {
  it('says plainly who can listen', () => {
    expect(visibilitySentence('private', 'track')).toBe(
      'Private: only you can see and hear this track.',
    );
    expect(visibilitySentence('unlisted', 'project')).toBe(
      'Anyone with a share link can listen to this project.',
    );
    expect(visibilitySentence('public', 'track')).toBe('Public: anyone can listen to this track.');
  });
});
