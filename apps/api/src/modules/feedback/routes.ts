import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  createFeedbackRequestSchema,
  createReplyRequestSchema,
  errorResponseSchema,
  feedbackListResponseSchema,
  feedbackParamsSchema,
  feedbackThreadSchema,
  updateFeedbackRequestSchema,
  versionParamsSchema,
} from '@feedback/shared';
import {
  createFeedback,
  deleteFeedback,
  editFeedback,
  getFeedback,
  replyToFeedback,
  type FeedbackDeps,
} from './service.ts';

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
};

// Comments on a version. Reading works for anyone who can view the track, signed in or not and
// with a share link if they have one; writing needs an account. Writes return the thread they
// changed, as the asker sees it.
export function feedbackRoutes(deps: FeedbackDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/versions/:versionId/feedback',
      {
        schema: {
          params: versionParamsSchema,
          response: { 200: feedbackListResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const list = await getFeedback(deps, request.actor, request.params.versionId);
        // Authors' pictures are signed URLs: no cache should keep them.
        void reply.header('cache-control', 'no-store');
        return list;
      },
    );

    app.post(
      '/versions/:versionId/feedback',
      {
        schema: {
          params: versionParamsSchema,
          body: createFeedbackRequestSchema,
          response: { 201: feedbackThreadSchema, ...errors, 409: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const thread = await createFeedback(
          deps,
          request.actor,
          request.params.versionId,
          request.body,
        );
        return reply.status(201).send(thread);
      },
    );

    app.post(
      '/feedback/:feedbackId/replies',
      {
        schema: {
          params: feedbackParamsSchema,
          body: createReplyRequestSchema,
          response: { 201: feedbackThreadSchema, ...errors },
        },
      },
      async (request, reply) => {
        const thread = await replyToFeedback(
          deps,
          request.actor,
          request.params.feedbackId,
          request.body,
        );
        return reply.status(201).send(thread);
      },
    );

    app.patch(
      '/feedback/:feedbackId',
      {
        schema: {
          params: feedbackParamsSchema,
          body: updateFeedbackRequestSchema,
          response: { 200: feedbackThreadSchema, ...errors },
        },
      },
      (request) => editFeedback(deps, request.actor, request.params.feedbackId, request.body),
    );

    app.delete(
      '/feedback/:feedbackId',
      {
        schema: {
          params: feedbackParamsSchema,
          response: { 204: z.null().describe('Deleted'), ...errors },
        },
      },
      async (request, reply) => {
        await deleteFeedback(deps, request.actor, request.params.feedbackId);
        return reply.status(204).send(null);
      },
    );
  };
}
