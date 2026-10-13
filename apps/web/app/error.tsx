'use client';

import { Show, SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';

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
    // Server errors arrive here with only a digest; the full error is in the server logs.
    console.error(error);
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
        <SignOutButton />
      </Show>
    </main>
  );
}
