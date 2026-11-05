'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { NotificationResponse } from '@feedback/shared';
import { truncate } from '../../lib/format';
import { groupByDay } from '../../lib/notification-days';
import { Avatar } from '../_shell/avatar';
import { markReadAction } from './actions';

/** A row's track title is cut here: clamping the sentence's lines would hide the version after it. */
const ROW_TITLE_LENGTH = 80;

const neverChanges = () => () => {};

/** The viewer's time zone, so "Today" is their today. UTC until hydrated: the server can't know. */
function useTimeZone() {
  return useSyncExternalStore(
    neverChanges,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => 'UTC',
  );
}

/**
 * The list under day headings, each row linking to its comment on the track page. Anything unread
 * is marked read once shown (then the header's count refreshes), but stays labelled "New" for this
 * visit. `now` comes from the server, so both sides agree on what today is when hydrating.
 */
export function NotificationList({
  notifications,
  now,
}: {
  notifications: readonly NotificationResponse[];
  now: string;
}) {
  const router = useRouter();
  const timeZone = useTimeZone();
  // What was unread when shown, kept after marking them read. This outlives a page: Older and
  // Newest only change the query, so the list stays mounted, and each page adds its own.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const unseen = notifications.filter((n) => !n.read && !fresh.has(n.id)).map((n) => n.id);
  if (unseen.length > 0) setFresh(new Set([...fresh, ...unseen]));

  useEffect(() => {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    void markReadAction(ids).then((result) => {
      if (result.ok) router.refresh();
    });
  }, [notifications, router]);

  return groupByDay(notifications, new Date(now), timeZone).map((day) => (
    <section key={day.key} aria-labelledby={`day-${day.key}`} className="mt-7 first-of-type:mt-0">
      <h2 id={`day-${day.key}`} className="mb-2 text-sm font-semibold text-muted">
        <time dateTime={day.key}>{day.label}</time>
      </h2>
      <ul className="border-t border-rule">
        {day.items.map((n) => (
          <Row key={n.id} notification={n} isNew={fresh.has(n.id)} />
        ))}
      </ul>
    </section>
  ));
}

/** One comment or reply: who, on which track and version, and the start of what they said. */
function Row({ notification: n, isNew }: { notification: NotificationResponse; isNew: boolean }) {
  const who = n.actor.displayName ?? (n.actor.handle ? `@${n.actor.handle}` : null);
  return (
    <li className="relative grid grid-cols-[1.5rem_1fr_auto] gap-3 border-b border-rule py-3 hover:bg-chrome-lo/60">
      <Avatar avatar={n.actor.avatar} size="header" />
      <div className="min-w-0">
        <Link
          href={`/tracks/${n.track.id}?comment=${n.feedbackId}`}
          className="row-link font-medium break-words"
        >
          {isNew && <span className="sr-only">New: </span>}
          {who ?? <span className="text-muted">Someone</span>}{' '}
          <span className="font-normal text-muted">
            {n.type === 'comment' ? 'commented on' : 'replied on'}
          </span>{' '}
          {truncate(n.track.title, ROW_TITLE_LENGTH)}&nbsp;
          <span className="font-normal text-muted">v{n.versionNumber}</span>
        </Link>
        <p className="mt-0.5 text-sm break-words text-muted">“{n.excerpt}”</p>
      </div>
      {isNew && (
        <span aria-hidden="true" className="font-lcd text-xs/6 text-accent uppercase">
          New
        </span>
      )}
    </li>
  );
}
