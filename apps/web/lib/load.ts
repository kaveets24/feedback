import 'server-only';
import { notFound, redirect } from 'next/navigation';
import { ApiError } from '@feedback/shared';

/**
 * Runs a page's API call. Someone else's resource looks the same as a missing one (CLAUDE.md
 * section 6, rule 9), so a 404 (or a malformed id's 400) shows the not-found page; a 403 means the
 * account isn't approved yet, which the home page explains.
 */
export async function loadOrNotFound<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    if (err instanceof ApiError && err.status === 403) redirect('/');
    throw err;
  }
}
