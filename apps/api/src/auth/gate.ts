import type { FastifyInstance } from 'fastify';
import { httpError } from '../errors.ts';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Lets signed-in users who aren't approved yet reach this route (e.g. GET /v1/me). */
    allowUnapproved?: boolean;
  }
}

/**
 * Invite-only gate (CLAUDE.md section 6). Signed-in users whose account isn't approved get a 403
 * on every route unless it opts out with `config: { allowUnapproved: true }`. Anonymous requests
 * pass through; routes decide what anonymous callers can see. Register after `registerAuth`.
 */
export function registerAccessGate(app: FastifyInstance): void {
  app.addHook('onRequest', async (request) => {
    const { actor } = request;
    if (actor.kind !== 'user' || actor.user.accessStatus === 'approved') return;
    if (request.routeOptions.config.allowUnapproved) return;

    throw actor.user.accessStatus === 'rejected'
      ? httpError(403, 'ACCOUNT_REJECTED', 'Your account was not approved')
      : httpError(403, 'ACCOUNT_PENDING', 'Your account is waiting for approval');
  });
}
