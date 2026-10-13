import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import { registerAccessGate } from './auth/gate.ts';
import { registerAuth } from './auth/plugin.ts';
import type { AuthPort } from './auth/port.ts';
import type { Env } from './env.ts';
import { registerErrorHandlers } from './errors.ts';
import { loggerOptions } from './logger.ts';
import { debugRoutes } from './modules/debug/routes.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { meRoutes } from './modules/me/routes.ts';
import { noopErrorReporter, type ErrorReporter } from './monitoring/port.ts';

export interface AppDeps {
  db: Db;
  auth: AuthPort;
  /** Where unexpected errors are reported. Defaults to reporting nothing. */
  errorReporter?: ErrorReporter;
}

export async function buildApp(env: Env, deps: AppDeps) {
  const app = Fastify({ logger: loggerOptions(env) }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app, deps.errorReporter ?? noopErrorReporter);
  registerAuth(app, deps);
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
      await v1.register(healthRoutes);
      await v1.register(meRoutes(deps.db));
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
