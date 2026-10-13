'use client';

import { Show, useClerk } from '@clerk/nextjs';
import * as Sentry from '@sentry/browser';
import Link from 'next/link';
import { useEffect } from 'react';

// Clerk's <SignOutButton> navigates client-side, which keeps this boundary mounted when the error
// was on "/" (Next only resets it on a path change). A full load starts over, signed out.
function SignOutAndReload() {
  const { signOut } = useClerk();
  return (
    <button type="button" onClick={() => void signOut(() => window.location.assign('/'))}>
      Sign out
    </button>
  );
}

// Catches errors thrown while rendering any page (server or client) below the root layout,
// so a failure shows a way out instead of a blank "This page couldn't load".
// Errors in the root layout itself are caught by global-error.tsx.
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Server errors arrive here with only a digest; the full error is in the server logs and
    // was already reported by instrumentation.ts. Errors from browser rendering have no digest.
    console.error(error);
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>This page hit an error and couldn&apos;t load. Trying again often fixes it.</p>
      {error.digest && (
        <p>
          Error reference: <code>{error.digest}</code>
        </p>
      )}
      <p>
        <button type="button" onClick={() => retry()}>
          Try again
        </button>{' '}
        <Link href="/">Go to the home page</Link>
      </p>
      <Show when="signed-in">
        <SignOutAndReload />
      </Show>
    </main>
  );
}
