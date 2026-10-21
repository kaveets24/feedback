import 'server-only';
import { auth } from '@clerk/nextjs/server';
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

/**
 * `loadOrNotFound` for a page anyone may open when what it shows is public (a track or project
 * page). A signed-out visitor who can't see it is sent to sign in instead, since it may be theirs.
 */
export async function loadOrSignIn<T>(call: () => Promise<T>): Promise<T> {
  const { isAuthenticated, redirectToSignIn } = await auth();
  return loadOrNotFound(async () => {
    try {
      return await call();
    } catch (err) {
      if (!isAuthenticated && err instanceof ApiError && (err.status === 404 || err.status === 400))
        return redirectToSignIn();
      throw err;
    }
  });
}
