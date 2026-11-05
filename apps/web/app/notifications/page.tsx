import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { serverApi } from '../../lib/api';
import { loadOrNotFound } from '../../lib/load';
import { NotificationList } from './notification-list';

export const metadata: Metadata = { title: 'Notifications · Feedback' };

/**
 * The signed-in user's notifications, newest first under day headings: comments and replies others
 * left on their tracks. Showing them marks them read.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { cursor } = await searchParams;
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error.
  const page = await loadOrNotFound(() =>
    serverApi().listNotifications(z.uuid().safeParse(cursor).success ? { cursor } : {}),
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <h1 className="mb-6 text-3xl font-semibold text-balance">Notifications</h1>
      {page.notifications.length === 0 && (
        <p className="border-y border-rule py-6 text-muted">
          {cursor ? (
            'No older notifications.'
          ) : (
            <>
              Nothing yet.{' '}
              <Link href="/tracks" className="link">
                Share a track
              </Link>{' '}
              and comments on it show up here.
            </>
          )}
        </p>
      )}
      {/* Stays mounted through an empty page, so it remembers what was new this visit. */}
      <NotificationList notifications={page.notifications} now={new Date().toISOString()} />

      {(cursor || page.nextCursor) && (
        <nav aria-label="More notifications" className="mt-4 flex gap-4 text-sm">
          {cursor && (
            <Link href="/notifications" className="link">
              Newest
            </Link>
          )}
          {page.nextCursor && (
            <Link href={`/notifications?cursor=${page.nextCursor}`} className="link">
              Older
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
