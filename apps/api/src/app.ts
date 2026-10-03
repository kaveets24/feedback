import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Env } from './env.ts';
import { registerErrorHandlers } from './errors.ts';
import { loggerOptions } from './logger.ts';
import { healthRoutes } from './modules/health/routes.ts';

export async function buildApp(env: Env) {
  const app = Fastify({ logger: loggerOptions(env) }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);

  await app.register(swagger, {
    openapi: { info: { title: 'Demo API', version: '0.0.0' } },
    transform: jsonSchemaTransform,
  });

  await app.register(
    async (v1) => {
      await v1.register(healthRoutes);
      v1.get('/openapi.json', { schema: { hide: true } }, () => app.swagger());
    },
    { prefix: '/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
