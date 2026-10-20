import type { FastifyInstance } from 'fastify';
import { upsertUserFromAuth, type Db, type ShareLink, type User } from '@feedback/db';
import { httpError } from '../errors.ts';
import type { AuthPort } from './port.ts';

/**
 * Who is asking, and the share link they presented, if any (looked up by its token's hash, in any
 * state: `canAccess` judges whether it still works, and for what).
 */
export type Actor = ({ kind: 'anonymous' } | { kind: 'user'; user: User }) & {
  shareLink?: ShareLink;
};

declare module 'fastify' {
  interface FastifyRequest {
    actor: Actor;
  }
}

const anonymous: Actor = { kind: 'anonymous' };

/**
 * Populates `request.actor` from the `Authorization: Bearer` header. No header means anonymous;
 * a malformed, invalid, or expired token is a 401. Users are created on first sight.
 */
export function registerAuth(app: FastifyInstance, deps: { auth: AuthPort; db: Db }): void {
  // Fastify forbids object defaults on request decorators, so start null; the hook below
  // always assigns before any handler runs.
  app.decorateRequest<Actor | null>('actor', null);

  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (!header) {
      request.actor = anonymous;
      return;
    }

    const token = /^Bearer (\S+)$/i.exec(header)?.[1];
    if (!token) throw httpError(401, 'UNAUTHENTICATED', 'Malformed authorization header');

    const identity = await deps.auth.verify(token);
    if (!identity) throw httpError(401, 'UNAUTHENTICATED', 'Invalid or expired session');

    const user = await upsertUserFromAuth(deps.db, {
      authProviderId: identity.providerId,
      email: identity.email,
    });
    request.actor = { kind: 'user', user };
  });
}
