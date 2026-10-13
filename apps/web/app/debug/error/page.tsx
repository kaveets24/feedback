import Link from 'next/link';
import { notFound } from 'next/navigation';
import { env } from '../../../lib/env';
import { BrowserErrorButton } from './browser-error-button';

// Read the flag per request, not at build time.
export const dynamic = 'force-dynamic';

// Checks error reporting end to end. Only exists while MONITORING_TEST_ERRORS=true, which is off
// everywhere except briefly on staging while testing (see docs/staging.md).
export default async function DebugErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ throw?: string }>;
}) {
  if (!env.MONITORING_TEST_ERRORS) notFound();
  if ((await searchParams).throw === 'server') {
    throw new Error('Test error from the web server');
  }

  return (
    <main>
      <h1>Error reporting test</h1>
      <p>Each of these throws an error that should show up in Sentry.</p>
      <p>
        <Link href="/debug/error?throw=server">Throw a server error</Link>
      </p>
      <BrowserErrorButton />
    </main>
  );
}
