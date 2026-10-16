import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../../app.ts';
import { buildTestApp, type FakeQueue } from '../../testing/app.ts';

describe('health routes', () => {
  let app: App;
  let queue: FakeQueue;
  const reported: unknown[] = [];

  beforeAll(async () => {
    ({ app, queue } = await buildTestApp({ errorReporter: { report: (e) => reported.push(e) } }));
  });
  beforeEach(() => {
    queue.status = { redis: true, workers: 1 };
    reported.length = 0;
  });

  afterAll(() => app.close());

  it('GET /v1/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /v1/health stays ok when the queue is down', async () => {
    queue.status = { redis: false, workers: 0 };
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /v1/health/queue returns ok with the worker count', async () => {
    queue.status = { redis: true, workers: 2 };
    const res = await app.inject({ method: 'GET', url: '/v1/health/queue' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', workers: 2 });
  });

  it.each([
    ['Redis is unreachable', { redis: false, workers: 0 }, /Redis/],
    ['no worker is connected', { redis: true, workers: 0 }, /No worker/],
  ])(
    'GET /v1/health/queue returns 503 when %s, without reporting it',
    async (_, status, message) => {
      queue.status = status;
      const res = await app.inject({ method: 'GET', url: '/v1/health/queue' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toEqual({
        error: {
          code: 'QUEUE_UNAVAILABLE',
          message: expect.stringMatching(message),
          details: status,
        },
      });
      expect(reported).toEqual([]);
    },
  );

  it('tells search engines not to index responses, including errors', async () => {
    for (const url of ['/v1/health', '/v1/nope']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    }
  });

  it('unknown routes return the standard error shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('serves the OpenAPI document', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().paths).toHaveProperty('/v1/health');
  });
});
