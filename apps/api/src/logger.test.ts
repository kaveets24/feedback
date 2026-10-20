import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { pino } from 'pino';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';
import { loggerOptions } from './logger.ts';
import { healthRoutes } from './modules/health/routes.ts';
import { fakeQueue } from './testing/app.ts';

const testEnv = () =>
  loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'info',
    DATABASE_URL: 'postgres://unused',
    CLERK_SECRET_KEY: 'sk_test_unused',
    REDIS_URL: 'redis://unused',
  });

/** An app using the real logger options, writing log lines into `lines`. */
async function buildLoggedApp() {
  const env = testEnv();
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  const app = Fastify({ logger: { ...loggerOptions(env), stream } });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.get('/echo', async () => ({ ok: true }));
  await app.register(healthRoutes(fakeQueue()), { prefix: '/v1' });
  return { app, lines };
}

describe('request logging', () => {
  it('logs the path without the query string', async () => {
    const { app, lines } = await buildLoggedApp();
    await app.inject({ method: 'GET', url: '/echo?token=secret#frag' });
    await app.close();

    const output = lines.join('');
    expect(output).toContain('"url":"/echo"');
    expect(output).not.toContain('secret');
  });

  it('never logs auth or share-link tokens sent with a request', async () => {
    const { app, lines } = await buildLoggedApp();
    await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: 'Bearer jwt-secret', 'x-share-token': 'share-secret' },
    });
    await app.close();

    const output = lines.join('');
    expect(output).toContain('"url":"/echo"');
    expect(output).not.toContain('jwt-secret');
    expect(output).not.toContain('share-secret');
  });

  it('redacts those headers from anything that logs them raw', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _encoding, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    // The real redact paths, without the request serializer that would otherwise drop headers.
    const { redact } = loggerOptions(testEnv());
    pino({ redact }, stream).info({
      req: { headers: { authorization: 'Bearer jwt-secret', 'x-share-token': 'share-secret' } },
    });

    const output = lines.join('');
    expect(output).toContain('[Redacted]');
    expect(output).not.toContain('jwt-secret');
    expect(output).not.toContain('share-secret');
  });

  it('does not log successful health checks', async () => {
    const { app, lines } = await buildLoggedApp();
    await app.inject({ method: 'GET', url: '/v1/health' });
    await app.close();

    expect(lines.join('')).not.toContain('/v1/health');
  });
});
