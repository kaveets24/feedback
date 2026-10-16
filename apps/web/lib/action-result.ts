import 'server-only';
import { ApiError } from '@feedback/shared';

/** What a server action returns: plain data the browser can receive, never a thrown ApiError. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Runs an API call for a server action. A 4xx from the API comes back as its message, which is
 * written for people; anything else is thrown, so it's reported like any other server error.
 */
export async function toResult<T>(call: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await call() };
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) return { ok: false, message: err.message };
    throw err;
  }
}
