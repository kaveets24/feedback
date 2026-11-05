import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CLIENT_IP_HEADER, WEB_SECRET_HEADER } from '@feedback/shared';
import { forwardedClientHeaders, RateLimitedError, rateLimitedFetch } from './rate-limit';
import { RATE_LIMITED_DIGEST } from './rate-limited-digest';

describe('rateLimitedFetch', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respondWith = (response: Response) =>
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

  it('leaves any other response alone', async () => {
    const response = new Response('{}', { status: 404 });
    respondWith(response);
    await expect(rateLimitedFetch('http://api/x')).resolves.toBe(response);
  });

  it('turns a 429 into an error that keeps the API’s words and carries the digest', async () => {
    const body = { error: { code: 'RATE_LIMITED', message: 'Try again in 30 seconds.' } };
    respondWith(new Response(JSON.stringify(body), { status: 429 }));

    const error = await rateLimitedFetch('http://api/x').catch((err: unknown) => err);
    expect(error).toBeInstanceOf(RateLimitedError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      message: 'Try again in 30 seconds.',
      digest: RATE_LIMITED_DIGEST,
    });
  });

  it('still says something when a 429 has no usable body', async () => {
    respondWith(new Response('nope', { status: 429 }));
    await expect(rateLimitedFetch('http://api/x')).rejects.toThrow(/Too many requests/);
  });
});

describe('forwardedClientHeaders', () => {
  const SECRET = 'a-secret';

  it('sends the visitor’s address with the secret', () => {
    expect(forwardedClientHeaders(new Headers({ 'x-real-ip': '203.0.113.1' }), SECRET)).toEqual({
      [WEB_SECRET_HEADER]: SECRET,
      [CLIENT_IP_HEADER]: '203.0.113.1',
    });
  });

  it('falls back to the first forwarded address', () => {
    const headers = new Headers({ 'x-forwarded-for': '203.0.113.2, 10.0.0.1' });
    expect(forwardedClientHeaders(headers, SECRET)[CLIENT_IP_HEADER]).toBe('203.0.113.2');
  });

  it('sends nothing without a secret, or without an address', () => {
    expect(forwardedClientHeaders(new Headers({ 'x-real-ip': '203.0.113.1' }), undefined)).toEqual(
      {},
    );
    expect(forwardedClientHeaders(new Headers(), SECRET)).toEqual({});
  });
});
