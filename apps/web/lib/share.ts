import type { ShareLinkResponse, Visibility } from '@feedback/shared';
import { formatDate } from './format';

/**
 * A share link's address: the token in the fragment, which browsers never send to a server
 * (CLAUDE.md section 6, rule 6).
 */
export function shareUrl(origin: string, token: string): string {
  return `${origin}/listen#${token}`;
}

export const EXPIRY_CHOICES = ['never', '1d', '7d', '30d'] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number];

export const EXPIRY_LABELS: Record<ExpiryChoice, string> = {
  never: 'Never',
  '1d': 'After 1 day',
  '7d': 'After 7 days',
  '30d': 'After 30 days',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_DAYS: Record<ExpiryChoice, number | null> = {
  never: null,
  '1d': 1,
  '7d': 7,
  '30d': 30,
};

/** When a link made `now` with this choice stops working, as ISO, or null for never. */
export function expiresAtFor(choice: ExpiryChoice, now: Date): string | null {
  const days = EXPIRY_DAYS[choice];
  return days === null ? null : new Date(now.getTime() + days * DAY_MS).toISOString();
}

export const ROLE_LABELS: Record<ShareLinkResponse['role'], string> = {
  listen: 'Can listen',
  comment: 'Can listen and comment',
};

/** Whether a link works now, and its state in plain words. */
export function linkState(link: ShareLinkResponse, now: Date): { active: boolean; text: string } {
  if (link.revokedAt) return { active: false, text: `Turned off ${formatDate(link.revokedAt)}` };
  if (link.expiresAt && Date.parse(link.expiresAt) <= now.getTime()) {
    return { active: false, text: `Expired ${formatDate(link.expiresAt)}` };
  }
  return {
    active: true,
    text: link.expiresAt ? `Works until ${formatDate(link.expiresAt)}` : 'Never expires',
  };
}

/** Who can listen, as a choice in the sharing settings. */
export const VISIBILITY_CHOICES: Record<Visibility, { label: string; description: string }> = {
  private: {
    label: 'Only you',
    description: 'Nobody else can see or hear it, even with a link.',
  },
  unlisted: {
    label: 'Anyone with a link',
    description:
      'People you send a share link to can listen, without an account. It isn’t listed anywhere.',
  },
  public: {
    label: 'Anyone',
    description: 'Anyone can listen, signed in or not.',
  },
};

/** One plain sentence on who can reach a track or project, for the line under its title. */
export function visibilitySentence(visibility: Visibility, noun: 'track' | 'project'): string {
  switch (visibility) {
    case 'private':
      return `Private: only you can see and hear this ${noun}.`;
    case 'unlisted':
      return `Anyone with a share link can listen to this ${noun}.`;
    case 'public':
      return `Public: anyone can listen to this ${noun}.`;
  }
}
