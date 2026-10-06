import type { z } from 'zod';
import { errorResponseSchema } from './schemas/common.ts';
import { meResponseSchema } from './schemas/me.ts';

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

  return {
    getMe: () => request('/v1/me', meResponseSchema),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
