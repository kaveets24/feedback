'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NotificationResponse } from '@feedback/shared';
import { formatDate } from '../../lib/format';
import { markReadAction } from './actions';

/**
 * The list, each item linking to its comment on the track page. Anything unread is marked read
 * once shown (then the header's count refreshes), but stays marked "New" for this visit.
 */
export function NotificationList({
  notifications,
}: {
  notifications: readonly NotificationResponse[];
}) {
  const router = useRouter();
  // What was unread when the page opened, kept after marking them read.
  const [fresh] = useState(() => new Set(notifications.filter((n) => !n.read).map((n) => n.id)));

  useEffect(() => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    void markReadAction(ids).then((result) => {
      if (result.ok) router.refresh();
    });
  }, [notifications, router]);

  return (
    <ul>
      {notifications.map((n) => {
        const who = n.actor.displayName ?? 'Someone';
        const did = n.type === 'comment' ? 'commented on' : 'replied on';
        return (
          <li key={n.id}>
            {fresh.has(n.id) && <strong>New: </strong>}
            <Link href={`/tracks/${n.track.id}?comment=${n.feedbackId}`}>
              {who} {did} {n.track.title} v{n.versionNumber}
            </Link>
            : “{n.excerpt}” (<time dateTime={n.createdAt}>{formatDate(n.createdAt)}</time>)
          </li>
        );
      })}
    </ul>
  );
}
