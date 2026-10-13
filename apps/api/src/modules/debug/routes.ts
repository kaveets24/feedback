import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

/**
 * Routes for checking monitoring end to end. Only registered when MONITORING_TEST_ERRORS=true,
 * which is off everywhere except briefly on staging while testing (see docs/staging.md).
 */
export const debugRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/debug/error', { schema: { hide: true } }, () => {
    throw new Error('Test error from GET /v1/debug/error');
  });
};
