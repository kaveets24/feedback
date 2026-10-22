'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** The name, linking home (the feed, once signed in), and marked as the current page there. */
export function Wordmark() {
  const home = usePathname() === '/';
  return (
    <Link
      href="/"
      aria-current={home ? 'page' : undefined}
      className="focus-glow flex h-14 items-center rounded-sm font-lcd text-lg text-lcd-ink"
    >
      Feedback
    </Link>
  );
}
