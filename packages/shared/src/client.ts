import type { z } from 'zod';
import { errorResponseSchema } from './schemas/common.ts';
import { meResponseSchema } from './schemas/me.ts';
import {
  streamResponseSchema,
  trackListResponseSchema,
  trackResponseSchema,
  versionResponseSchema,
  type TrackListQuery,
} from './schemas/tracks.ts';
import { createUploadResponseSchema, type CreateUploadRequest } from './schemas/uploads.ts';

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
    const body: unknown = await res.json().catch(() => null);

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

  const post = <T>(path: string, schema: z.ZodType<T>, body?: unknown) =>
    request(path, schema, {
      method: 'POST',
      ...(body !== undefined && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });

  return {
    getMe: () => request('/v1/me', meResponseSchema),
    /** Starts an upload: creates the track and its v1, and returns where to PUT the file. */
    createUpload: (input: CreateUploadRequest) =>
      post('/v1/uploads', createUploadResponseSchema, input),
    /** Call once the PUT succeeds. Safe to repeat; returns the version's state. */
    completeUpload: (versionId: string) =>
      post(`/v1/uploads/${encodeURIComponent(versionId)}/complete`, versionResponseSchema),
    getVersion: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}`, versionResponseSchema),
    /** A short-lived URL for a ready version's audio. Fetch a new one when it expires. */
    getStream: (versionId: string) =>
      request(`/v1/versions/${encodeURIComponent(versionId)}/stream`, streamResponseSchema),
    /** The signed-in user's tracks, newest first. Pass `nextCursor` back as `cursor` for more. */
    listTracks: ({ cursor, limit }: TrackListQuery = {}) => {
      const query = new URLSearchParams();
      if (cursor) query.set('cursor', cursor);
      if (limit !== undefined) query.set('limit', String(limit));
      const search = query.size ? `?${query}` : '';
      return request(`/v1/tracks${search}`, trackListResponseSchema);
    },
    getTrack: (trackId: string) =>
      request(`/v1/tracks/${encodeURIComponent(trackId)}`, trackResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
