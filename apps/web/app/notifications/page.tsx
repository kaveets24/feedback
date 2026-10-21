import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import { serverApi } from '../../lib/api';
import { loadOrNotFound } from '../../lib/load';
import { NotificationList } from './notification-list';

export const metadata: Metadata = { title: 'Notifications · Feedback' };

/**
 * The signed-in user's notifications, newest first: comments and replies others left on their
 * tracks. Showing them marks them read. Plain HTML until this page is styled (CLAUDE.md section 9).
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
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1>Notifications</h1>
      {page.notifications.length === 0 ? (
        <p>
          {cursor
            ? 'No older notifications.'
            : 'Nothing yet. When someone comments on one of your tracks, it shows up here.'}
        </p>
      ) : (
        <NotificationList notifications={page.notifications} />
      )}
      <p>
        {cursor && <Link href="/notifications">Newest</Link>}
        {cursor && page.nextCursor && ' · '}
        {page.nextCursor && <Link href={`/notifications?cursor=${page.nextCursor}`}>Older</Link>}
      </p>
    </main>
  );
}
