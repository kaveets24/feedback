import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '@feedback/db';
import {
  errorResponseSchema,
  trackListQuerySchema,
  trackListResponseSchema,
  trackParamsSchema,
  trackResponseSchema,
  updateTrackRequestSchema,
} from '@feedback/shared';
import { deleteTrack, getTrack, listMyTracks, updateTrack } from './service.ts';

export function trackRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/tracks',
      {
        schema: {
          querystring: trackListQuerySchema,
          response: { 200: trackListResponseSchema, 401: errorResponseSchema },
        },
      },
      (request) => listMyTracks(db, request.actor, request.query),
    );

    app.get(
      '/tracks/:trackId',
      {
        schema: {
          params: trackParamsSchema,
          response: { 200: trackResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => getTrack(db, request.actor, request.params.trackId),
    );

    app.patch(
      '/tracks/:trackId',
      {
        schema: {
          params: trackParamsSchema,
          body: updateTrackRequestSchema,
          response: {
            200: trackResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) => updateTrack(db, request.actor, request.params.trackId, request.body),
    );

    app.delete(
      '/tracks/:trackId',
      {
        schema: {
          params: trackParamsSchema,
          response: { 204: z.null().describe('Deleted'), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await deleteTrack(db, request.actor, request.params.trackId);
        return reply.status(204).send(null);
      },
    );
  };
}
