import { z } from 'zod';
import { errorResponseSchema } from './schemas/common.ts';
import {
  coverResponseSchema,
  createCoverResponseSchema,
  type CreateCoverRequest,
} from './schemas/covers.ts';
import { meResponseSchema } from './schemas/me.ts';
import {
  projectDetailResponseSchema,
  projectListResponseSchema,
  projectResponseSchema,
  projectTracksResponseSchema,
  type CreateProjectRequest,
  type ProjectListQuery,
  type UpdateProjectRequest,
} from './schemas/projects.ts';
import {
  streamResponseSchema,
  trackListResponseSchema,
  trackResponseSchema,
  versionResponseSchema,
  type TrackListQuery,
  type UpdateVersionRequest,
} from './schemas/tracks.ts';
import {
  createUploadResponseSchema,
  type CreateUploadRequest,
  type CreateVersionRequest,
} from './schemas/uploads.ts';

/** A non-2xx API response, carrying the standard error body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Returns the current session token, or null when signed out. */
  getToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
}

/** Typed client for the HTTP API. Every response is validated against its zod schema. */
export function createApiClient({ baseUrl, getToken, fetch = globalThis.fetch }: ApiClientOptions) {
  async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const token = await getToken?.();
    if (token) headers.set('authorization', `Bearer ${token}`);

    const res = await fetch(new URL(path, baseUrl), { ...init, headers });
    const body: unknown = res.status === 204 ? undefined : await res.json().catch(() => null);

    if (!res.ok) {
      const parsed = errorResponseSchema.safeParse(body);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiError(res.status, code, message, details);
      }
      throw new ApiError(res.status, 'UNKNOWN_ERROR', `Request failed with status ${res.status}`);
    }
    return schema.parse(body);
  }

  const send = <T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(path, schema, {
      method,
      ...(body !== undefined && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    send('POST', path, schema, body);

  const pageQuery = ({ cursor, limit }: TrackListQuery | ProjectListQuery) => {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (limit !== undefined) query.set('limit', String(limit));
    return query.size ? `?${query}` : '';
  };

  return {
    getMe: () => request('/v1/me', meResponseSchema),
    /** Starts an upload: creates the track and its v1, and returns where to PUT the file. */
    createUpload: (input: CreateUploadRequest) =>
      post('/v1/uploads', createUploadResponseSchema, input),
    /** Call once the PUT succeeds. Safe to repeat; returns the version's state. */
    completeUpload: (versionId: string) =>
      post(`/v1/uploads/${encodeURIComponent(versionId)}/complete`, versionResponseSchema),
    /** Starts uploading a track's next version; finish it with `completeUpload`, as for v1. */
    createVersion: (trackId: string, input: CreateVersionRequest) =>
      post(`/v1/tracks/${encodeURIComponent(trackId)}/versions`, createUploadResponseSchema, input),
    /** Changes a version's notes (null clears them). */
    updateVersion: (versionId: string, changes: UpdateVersionRequest) =>
      send(
        'PATCH',
        `/v1/versions/${encodeURIComponent(versionId)}`,
        versionResponseSchema,
        changes,
      ),
    getVersion: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}`, versionResponseSchema),
    /** A short-lived URL for a ready version's audio. Fetch a new one when it expires. */
    getStream: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}/stream`, streamResponseSchema),
    /** The signed-in user's tracks, newest first. Pass `nextCursor` back as `cursor` for more. */
    listTracks: (query: TrackListQuery = {}) =>
      request(`/v1/tracks${pageQuery(query)}`, trackListResponseSchema),
    getTrack: (trackId: string) =>
      request(`/v1/tracks/${encodeURIComponent(trackId)}`, trackResponseSchema),
    /** The signed-in user's projects, newest first. Pass `nextCursor` back as `cursor` for more. */
    listProjects: (query: ProjectListQuery = {}) =>
      request(`/v1/projects${pageQuery(query)}`, projectListResponseSchema),
    /** A project, with any cover upload still processing or that failed. */
    getProject: (projectId: string) =>
      request(`/v1/projects/${encodeURIComponent(projectId)}`, projectDetailResponseSchema),
    /** Starts uploading new cover art; PUT the image to `upload`, then `completeCoverUpload`. */
    startCoverUpload: (projectId: string, input: CreateCoverRequest) =>
      post(
        `/v1/projects/${encodeURIComponent(projectId)}/covers`,
        createCoverResponseSchema,
        input,
      ),
    /** Call once the PUT succeeds. Safe to repeat; returns the cover upload's state. */
    completeCoverUpload: (projectId: string, coverId: string) =>
      post(
        `/v1/projects/${encodeURIComponent(projectId)}/covers/${encodeURIComponent(coverId)}/complete`,
        coverResponseSchema,
      ),
    /** A cover upload's state, to poll while it processes. */
    getCover: (projectId: string, coverId: string) =>
      request(
        `/v1/projects/${encodeURIComponent(projectId)}/covers/${encodeURIComponent(coverId)}`,
        coverResponseSchema,
      ),
    /** Takes the project's cover off. */
    removeCover: (projectId: string) =>
      send('DELETE', `/v1/projects/${encodeURIComponent(projectId)}/cover`, z.undefined()),
    /** Creates a private project. */
    createProject: (input: CreateProjectRequest) =>
      post('/v1/projects', projectResponseSchema, input),
    /** Changes only the fields given. */
    updateProject: (projectId: string, changes: UpdateProjectRequest) =>
      send(
        'PATCH',
        `/v1/projects/${encodeURIComponent(projectId)}`,
        projectResponseSchema,
        changes,
      ),
    /** Deletes the project. Its tracks become loose; no songs are deleted. */
    deleteProject: (projectId: string) =>
      send('DELETE', `/v1/projects/${encodeURIComponent(projectId)}`, z.undefined()),
    /** A project's tracks in order. */
    listProjectTracks: (projectId: string) =>
      request(`/v1/projects/${encodeURIComponent(projectId)}/tracks`, projectTracksResponseSchema),
    /** Adds a track to the end of the project (moving it out of any other). Returns the new list. */
    addProjectTrack: (projectId: string, trackId: string) =>
      post(`/v1/projects/${encodeURIComponent(projectId)}/tracks`, projectTracksResponseSchema, {
        trackId,
      }),
    /**
     * Sets the order. Pass every track in the project, as last loaded; if they've changed since,
     * it throws an `ApiError` with status 409 and nothing moves.
     */
    reorderProjectTracks: (projectId: string, trackIds: string[]) =>
      send(
        'PUT',
        `/v1/projects/${encodeURIComponent(projectId)}/tracks`,
        projectTracksResponseSchema,
        { trackIds },
      ),
    /** Takes a track out of the project; it stays in your tracks. */
    removeProjectTrack: (projectId: string, trackId: string) =>
      send(
        'DELETE',
        `/v1/projects/${encodeURIComponent(projectId)}/tracks/${encodeURIComponent(trackId)}`,
        z.undefined(),
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
