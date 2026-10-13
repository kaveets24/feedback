import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../../app.ts';
import { buildTestApp } from '../../testing/app.ts';

describe('debug routes', () => {
  let app: App | undefined;

  afterEach(() => app?.close());

  function recordingReporter() {
    const reported: unknown[] = [];
    return { reported, errorReporter: { report: (error: unknown) => reported.push(error) } };
  }

  it('are not registered unless MONITORING_TEST_ERRORS is on', async () => {
    ({ app } = await buildTestApp());
    const res = await app.inject({ method: 'GET', url: '/v1/debug/error' });
    expect(res.statusCode).toBe(404);
  });

  it('GET /v1/debug/error returns a generic 500 and reports the error', async () => {
    const { reported, errorReporter } = recordingReporter();
    ({ app } = await buildTestApp({ env: { MONITORING_TEST_ERRORS: 'true' }, errorReporter }));

    const res = await app.inject({ method: 'GET', url: '/v1/debug/error' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('Test error from GET /v1/debug/error');
  });

  it('client errors (4xx) are not reported', async () => {
    const { reported, errorReporter } = recordingReporter();
    ({ app } = await buildTestApp({ errorReporter }));

    const notFound = await app.inject({ method: 'GET', url: '/v1/nope' });
    const unauthenticated = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    expect(notFound.statusCode).toBe(404);
    expect(unauthenticated.statusCode).toBe(401);
    expect(reported).toEqual([]);
  });

  it('is hidden from the OpenAPI document', async () => {
    ({ app } = await buildTestApp({ env: { MONITORING_TEST_ERRORS: 'true' } }));
    const res = await app.inject({ method: 'GET', url: '/v1/openapi.json' });
    expect(res.json().paths).not.toHaveProperty('/v1/debug/error');
  });
});
