import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import {
  errorResponseSchema,
  trackListQuerySchema,
  trackListResponseSchema,
  trackParamsSchema,
  trackResponseSchema,
} from '@feedback/shared';
import { getTrack, listMyTracks } from './service.ts';

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
  };
}
