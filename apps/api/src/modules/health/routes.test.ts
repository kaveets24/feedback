import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.ts';
import { loadEnv } from '../../env.ts';

describe('health routes', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp(loadEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
  });

  afterAll(() => app.close());

  it('GET /v1/health returns ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
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
