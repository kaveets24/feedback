import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  meResponseSchema,
  profileResponseSchema,
  updateProfileRequestSchema,
} from '@feedback/shared';
import { httpError } from '../../errors.ts';
import { getMe, getProfile, updateProfile, type ProfileDeps } from './service.ts';

export function meRoutes(deps: ProfileDeps): FastifyPluginAsyncZod {
  const { db } = deps;
  return async (app) => {
    app.get(
      '/me',
      {
        schema: { response: { 200: meResponseSchema, 401: errorResponseSchema } },
        // Pending and rejected users need this to learn their status.
        config: { allowUnapproved: true },
      },
      async (request) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return getMe(db, actor.user);
      },
    );

    // Your own profile: there's no resource to authorize beyond being signed in as yourself.
    app.get(
      '/me/profile',
      { schema: { response: { 200: profileResponseSchema, 401: errorResponseSchema } } },
      async (request) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return getProfile(deps, actor.user);
      },
    );

    app.patch(
      '/me/profile',
      {
        schema: {
          body: updateProfileRequestSchema,
          response: {
            200: profileResponseSchema,
            401: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return updateProfile(deps, actor.user, request.body);
      },
    );
  };
}
