import type { FastifyInstance } from 'fastify';
import type { Db } from '@feedback/db';
import { SHARE_TOKEN_HEADER, shareTokenSchema } from '@feedback/shared';
import { findShareLinkByHash, hashShareToken } from '../modules/share-links/repo.ts';

/**
 * Attaches the share link a request presents in the `x-share-token` header to `request.actor`.
 * A token that's malformed or matches no link is ignored rather than refused: the request goes on
 * without a link, and anything it can't reach is the usual 404. The token is hashed before the
 * lookup and never logged (the logger redacts the header). Register after `registerAuth`.
 */
export function registerShareLinks(app: FastifyInstance, deps: { db: Db }): void {
  app.addHook('onRequest', async (request) => {
    const parsed = shareTokenSchema.safeParse(request.headers[SHARE_TOKEN_HEADER]);
    if (!parsed.success) return;
    const link = await findShareLinkByHash(deps.db, hashShareToken(parsed.data));
    if (link) request.actor = { ...request.actor, shareLink: link };
  });
}
