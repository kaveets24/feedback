import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponseSchema,
  markNotificationsReadRequestSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  unreadCountResponseSchema,
} from '@feedback/shared';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import {
  getNotifications,
  getUnreadCount,
  readNotifications,
  type NotificationDeps,
} from './service.ts';

/** The signed-in user, or a 401: notifications are always your own. */
function signedIn(actor: Actor) {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
  return actor.user;
}

export function notificationRoutes(deps: NotificationDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/notifications',
      {
        schema: {
          querystring: notificationListQuerySchema,
          response: { 200: notificationListResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const list = await getNotifications(deps, signedIn(request.actor), request.query);
        // Commenters' pictures are signed URLs: no cache should keep them.
        void reply.header('cache-control', 'no-store');
        return list;
      },
    );

    app.get(
      '/notifications/unread-count',
      {
        schema: { response: { 200: unreadCountResponseSchema, 401: errorResponseSchema } },
      },
      (request) => getUnreadCount(deps.db, signedIn(request.actor)),
    );

    app.post(
      '/notifications/read',
      {
        schema: {
          body: markNotificationsReadRequestSchema,
          response: { 204: z.null().describe('Marked read'), 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await readNotifications(deps.db, signedIn(request.actor), request.body);
        return reply.status(204).send(null);
      },
    );
  };
}
