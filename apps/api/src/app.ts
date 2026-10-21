import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import type { Storage } from '@feedback/storage';
import { registerAccessGate } from './auth/gate.ts';
import { registerAuth } from './auth/plugin.ts';
import { registerShareLinks } from './auth/share-link.ts';
import type { AuthPort } from './auth/port.ts';
import type { Env } from './env.ts';
import { registerErrorHandlers } from './errors.ts';
import { loggerOptions } from './logger.ts';
import { debugRoutes } from './modules/debug/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { avatarRoutes } from './modules/avatars/routes.ts';
import { meRoutes } from './modules/me/routes.ts';
import { coverRoutes } from './modules/covers/routes.ts';
import { feedbackRoutes } from './modules/feedback/routes.ts';
import { notificationRoutes } from './modules/notifications/routes.ts';
import { profileRoutes } from './modules/profiles/routes.ts';
import { projectRoutes } from './modules/projects/routes.ts';
import { shareLinkRoutes } from './modules/share-links/routes.ts';
import { uploadRoutes } from './modules/uploads/routes.ts';
import { trackRoutes } from './modules/tracks/routes.ts';
import { versionRoutes } from './modules/versions/routes.ts';
import { noopErrorReporter, type ErrorReporter } from './monitoring/port.ts';
import type { JobQueue } from './queue.ts';

export interface AppDeps {
  db: Db;
  auth: AuthPort;
  storage: Storage;
  queue: JobQueue;
  /** Where unexpected errors are reported. Defaults to reporting nothing. */
  errorReporter?: ErrorReporter;
}

export async function buildApp(env: Env, deps: AppDeps) {
  const app = Fastify({ logger: loggerOptions(env) }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app, deps.errorReporter ?? noopErrorReporter);
  // Background connection errors (Redis restarting, say). Enqueueing fails while it's down, and
  // that request's error is reported, so these are only logged.
  deps.queue.onError((err) => app.log.warn({ err }, 'job queue connection error'));
  registerAuth(app, deps);
  registerShareLinks(app, deps);
  registerAccessGate(app);
  // The API is never meant for search engines, in any environment.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('x-robots-tag', 'noindex, nofollow');
  });

  await app.register(swagger, {
    openapi: { info: { title: 'Feedback API', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes(deps.queue));
      await v1.register(meRoutes(deps));
      await v1.register(avatarRoutes(deps));
      await v1.register(profileRoutes(deps));
      await v1.register(uploadRoutes(deps));
      await v1.register(versionRoutes(deps));
      await v1.register(trackRoutes(deps.db));
      await v1.register(projectRoutes(deps));
      await v1.register(coverRoutes(deps));
      await v1.register(feedbackRoutes(deps));
      await v1.register(notificationRoutes(deps));
      await v1.register(shareLinkRoutes(deps.db));
      if (env.MONITORING_TEST_ERRORS) await v1.register(debugRoutes);
      v1.get('/openapi.json', { schema: { hide: true }, config: { allowUnapproved: true } }, () =>
        app.swagger(),
      );
    },
    { prefix: '/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
