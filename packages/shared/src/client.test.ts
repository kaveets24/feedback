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

  it('posts a new upload as JSON', async () => {
    const created = {
      trackId: '01890a5d-ac96-774b-bcce-b302099a8057',
      versionId: '01890a5d-ac96-774b-bcce-b302099a8058',
      upload: {
        url: 'http://storage.test/b/originals/x?sig=1',
        method: 'PUT',
        headers: { 'content-type': 'audio/wav' },
        expiresAt: '2026-10-16T00:15:00.000Z',
      },
    };
    const fetch = fakeFetch(201, created);
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });
    const input = {
      title: 'Demo',
      filename: 'demo.wav',
      contentType: 'audio/wav',
      sizeBytes: 10,
    } as const;

    await expect(api.createUpload(input)).resolves.toEqual(created);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('http://api.test/v1/uploads');
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(input);
  });

  it('completes an upload with an empty POST', async () => {
    const version = {
      id: '01890a5d-ac96-774b-bcce-b302099a8058',
      trackId: '01890a5d-ac96-774b-bcce-b302099a8057',
      versionNumber: 1,
      status: 'processing',
      failureReason: null,
      durationMs: null,
      waveformPeaks: null,
      createdAt: '2026-10-16T00:00:00.000Z',
    };
    const fetch = fakeFetch(200, version);
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await expect(api.completeUpload(version.id)).resolves.toEqual(version);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`http://api.test/v1/uploads/${version.id}/complete`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
  });

  it('lists tracks with the cursor and limit in the query string', async () => {
    const fetch = fakeFetch(200, { tracks: [], nextCursor: null });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await api.listTracks();
    await api.listTracks({ cursor: '01890a5d-ac96-774b-bcce-b302099a8057', limit: 5 });
    const urls = fetch.mock.calls.map((call) => String((call as unknown as [URL])[0]));
    expect(urls).toEqual([
      'http://api.test/v1/tracks',
      'http://api.test/v1/tracks?cursor=01890a5d-ac96-774b-bcce-b302099a8057&limit=5',
    ]);
  });

  it('fetches a stream URL for a version', async () => {
    const stream = {
      url: 'http://storage.test/b/streams/x?sig=1',
      expiresAt: '2026-10-16T00:10:00.000Z',
    };
    const fetch = fakeFetch(200, stream);
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await expect(api.getStream('01890a5d-ac96-774b-bcce-b302099a8058')).resolves.toEqual(stream);
    const [url] = fetch.mock.calls[0] as unknown as [URL];
    expect(url.toString()).toBe(
      'http://api.test/v1/versions/01890a5d-ac96-774b-bcce-b302099a8058/stream',
    );
  });

  const project = {
    id: '01890a5d-ac96-774b-bcce-b302099a8059',
    title: 'EP',
    description: null,
    status: 'idea',
    visibility: 'private',
    createdAt: '2026-10-19T00:00:00.000Z',
  };

  it('lists projects with the cursor and limit in the query string', async () => {
    const fetch = fakeFetch(200, { projects: [project], nextCursor: null });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await expect(api.listProjects()).resolves.toEqual({ projects: [project], nextCursor: null });
    await api.listProjects({ cursor: project.id, limit: 5 });
    const urls = fetch.mock.calls.map((call) => String((call as unknown as [URL])[0]));
    expect(urls).toEqual([
      'http://api.test/v1/projects',
      `http://api.test/v1/projects?cursor=${project.id}&limit=5`,
    ]);
  });

  it('updates a project with a JSON PATCH', async () => {
    const fetch = fakeFetch(200, { ...project, title: 'LP' });
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await expect(api.updateProject(project.id, { title: 'LP' })).resolves.toMatchObject({
      title: 'LP',
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`http://api.test/v1/projects/${project.id}`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ title: 'LP' });
  });

  it('deletes a project and accepts the empty 204', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    const api = createApiClient({ baseUrl: 'http://api.test', fetch });

    await expect(api.deleteProject(project.id)).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`http://api.test/v1/projects/${project.id}`);
    expect(init.method).toBe('DELETE');
  });

  it('throws when a success response does not match the schema', async () => {
    const api = createApiClient({ baseUrl: 'http://api.test', fetch: fakeFetch(200, { id: 1 }) });
    await expect(api.getMe()).rejects.toThrow();
  });
});
