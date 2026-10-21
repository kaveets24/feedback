import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  avatarParamsSchema,
  avatarResponseSchema,
  createAvatarRequestSchema,
  createAvatarResponseSchema,
  errorResponseSchema,
} from '@feedback/shared';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import {
  completeAvatarUpload,
  getAvatar,
  removeOwnAvatar,
  startAvatarUpload,
  type AvatarDeps,
} from './service.ts';

/** The signed-in user, or a 401: pictures are always your own. */
function signedIn(actor: Actor) {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
  return actor.user;
}

// A profile picture follows the cover art flow: POST /me/avatars for a presigned PUT, the browser
// PUTs the image straight to storage, then POST /me/avatars/:avatarId/complete hands it to the
// worker, which re-encodes it. The approval gate applies, as on every route.
export function avatarRoutes(deps: AvatarDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/me/avatars',
      {
        schema: {
          body: createAvatarRequestSchema,
          response: { 201: createAvatarResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const upload = await startAvatarUpload(deps, signedIn(request.actor), request.body);
        return reply.status(201).send(upload);
      },
    );

    app.post(
      '/me/avatars/:avatarId/complete',
      {
        schema: {
          params: avatarParamsSchema,
          response: {
            200: avatarResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) => completeAvatarUpload(deps, signedIn(request.actor), request.params.avatarId),
    );

    app.get(
      '/me/avatars/:avatarId',
      {
        schema: {
          params: avatarParamsSchema,
          response: {
            200: avatarResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      (request) => getAvatar(deps.db, signedIn(request.actor), request.params.avatarId),
    );

    app.delete(
      '/me/avatar',
      {
        schema: {
          response: { 204: z.null().describe('Removed'), 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await removeOwnAvatar(deps.db, signedIn(request.actor));
        return reply.status(204).send(null);
      },
    );
  };
}
