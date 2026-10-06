import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client.ts';

const me = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  email: 'a@x.test',
  accessStatus: 'pending',
  profile: null,
};

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () => Response.json(body, { status }));
}

describe('createApiClient', () => {
  it('sends the bearer token and parses the response', async () => {
    const fetch = fakeFetch(200, me);
    const api = createApiClient({
      baseUrl: 'http://api.test',
      getToken: async () => 'tok',
      fetch,
    });

    await expect(api.getMe()).resolves.toEqual(me);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://api.test/v1/me');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer tok');
  });

  it('omits the authorization header when signed out', async () => {
    const fetch = fakeFetch(200, me);
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: async () => null, fetch });

    await api.getMe();
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(new Headers(init.headers).has('authorization')).toBe(false);
  });

  it('throws ApiError with the standard error body', async () => {
    const fetch = fakeFetch(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in' } });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    const err = await api.getMe().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', message: 'Sign in' });
  });

  it('throws when a success response does not match the schema', async () => {
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: fakeFetch(200, { id: 1 }) });
    await expect(api.getMe()).rejects.toThrow();
  });
});
