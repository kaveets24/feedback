'use client';

import { useEffect } from 'react';

// Last-resort boundary for errors in the root layout (e.g. ClerkProvider failing). It replaces
// the whole document, so it renders its own <html> and <body> and can't rely on the layout's
// providers. Page-level errors are caught by error.tsx instead.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <title>Something went wrong · Feedback</title>
        <main>
          <h1>Something went wrong</h1>
          <p>Feedback hit an error and couldn&apos;t load. Trying again often fixes it.</p>
          {error.digest && (
            <p>
              Error reference: <code>{error.digest}</code>
            </p>
          )}
          <p>
            <button type="button" onClick={() => retry()}>
              Try again
            </button>{' '}
            {/* A plain <a> forces a full reload, which re-runs the root layout. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Go to the home page</a>
          </p>
        </main>
      </body>
    </html>
  );
}
