import { isLinkActive, type ResourceKind } from '@feedback/authz';
import type { Db, ShareLink } from '@feedback/db';
import type {
  CreateShareLinkRequest,
  CreateShareLinkResponse,
  ShareLinkListResponse,
  ShareLinkResponse,
} from '@feedback/shared';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import { loadProjectFor } from '../projects/service.ts';
import { loadTrackAccess } from '../tracks/service.ts';
import {
  findShareLink,
  insertShareLink,
  listShareLinks,
  newShareToken,
  revokeShareLink as revoke,
} from './repo.ts';

export function toShareLinkResponse(link: ShareLink, now = new Date()): ShareLinkResponse {
  return {
    id: link.id,
    resourceType: link.resourceType,
    resourceId: link.resourceId,
    role: link.role,
    expiresAt: link.expiresAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    active: isLinkActive(link, now),
  };
}

/** Checks the actor may manage the track or project (else the usual 404), and returns them. */
async function loadManaged(db: Db, actor: Actor, kind: ResourceKind, id: string) {
  if (kind === 'track') await loadTrackAccess(db, actor, id, 'manage');
  else await loadProjectFor(db, actor, id, 'manage');
  // Only an owner may manage, and owners are signed in.
  if (actor.kind !== 'user') throw httpError(404, 'NOT_FOUND', 'Not found');
  return actor.user;
}

/** Makes a share link for a track or project the actor owns. Its token is returned only here. */
export async function createShareLink(
  db: Db,
  actor: Actor,
  kind: ResourceKind,
  resourceId: string,
  input: { role: CreateShareLinkRequest['role']; expiresAt: string | null },
): Promise<CreateShareLinkResponse> {
  const owner = await loadManaged(db, actor, kind, resourceId);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw httpError(400, 'EXPIRY_IN_PAST', 'A link has to expire in the future');
  }
  const { token, hash } = newShareToken();
  const link = await insertShareLink(db, {
    resourceType: kind,
    resourceId,
    tokenHash: hash,
    role: input.role,
    expiresAt,
    createdBy: owner.id,
  });
  return { link: toShareLinkResponse(link), token };
}

/** A track's or project's links, for its owner. */
export async function listResourceShareLinks(
  db: Db,
  actor: Actor,
  kind: ResourceKind,
  resourceId: string,
): Promise<ShareLinkListResponse> {
  await loadManaged(db, actor, kind, resourceId);
  const now = new Date();
  const links = await listShareLinks(db, kind, resourceId);
  return { links: links.map((link) => toShareLinkResponse(link, now)) };
}

/**
 * Revokes a link, effective with the next request that presents it. Takes `manage` on what it was
 * made for; anyone else, and a link that doesn't exist, gets a 404. Safe to repeat.
 */
export async function revokeShareLink(db: Db, actor: Actor, linkId: string): Promise<void> {
  const link = await findShareLink(db, linkId);
  if (!link) throw httpError(404, 'NOT_FOUND', 'Not found');
  await loadManaged(db, actor, link.resourceType, link.resourceId);
  await revoke(db, link.id);
}
