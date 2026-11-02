import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ResourceKind } from '@feedback/authz';
import { shareLinks, type Db, type ShareLink } from '@feedback/db';

/**
 * A new share token and the hash stored for it. 32 random bytes is 256 bits (rule 6 asks for at
 * least 128); a plain SHA-256 is enough for a token that random, with no salt or slow hash needed.
 */
export function newShareToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function insertShareLink(
  db: Db,
  input: {
    resourceType: ResourceKind;
    resourceId: string;
    tokenHash: string;
    expiresAt: Date | null;
    createdBy: string;
  },
): Promise<ShareLink> {
  const [link] = await db.insert(shareLinks).values(input).returning();
  if (!link) throw new Error('insert returned no share link');
  return link;
}

/** The link with this token hash, in any state (`canAccess` judges expiry and revocation). */
export async function findShareLinkByHash(db: Db, tokenHash: string): Promise<ShareLink | null> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.tokenHash, tokenHash));
  return link ?? null;
}

export async function findShareLink(db: Db, linkId: string): Promise<ShareLink | null> {
  const [link] = await db.select().from(shareLinks).where(eq(shareLinks.id, linkId));
  return link ?? null;
}

/** A track's or project's links, newest first (ids are UUIDv7). */
export async function listShareLinks(
  db: Db,
  resourceType: ResourceKind,
  resourceId: string,
): Promise<ShareLink[]> {
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.resourceType, resourceType), eq(shareLinks.resourceId, resourceId)))
    .orderBy(desc(shareLinks.id));
}

/** Revokes a link now, unless it already was (then it keeps its first revocation time). */
export async function revokeShareLink(db: Db, linkId: string): Promise<void> {
  await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.id, linkId), isNull(shareLinks.revokedAt)));
}
