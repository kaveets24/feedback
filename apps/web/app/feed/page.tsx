import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import type { FollowedArtist } from '@feedback/shared';
import { serverApi } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';
import { loadOrNotFound } from '../../lib/load';
import { collectPages } from '../../lib/pages';

export const metadata: Metadata = { title: 'Feed · Feedback' };

const name = (artist: FollowedArtist) => artist.displayName ?? `@${artist.handle}`;

/**
 * New public work by the people the signed-in user follows, newest first: each new track, and
 * each new version of one. Under it, who they follow. Plain HTML until this page is styled
 * (CLAUDE.md section 9).
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const { cursor } = await searchParams;
  const api = serverApi();
  // An invalid cursor (a hand-edited URL) shows the first page rather than an error.
  const first = !z.uuid().safeParse(cursor).success;
  const [page, following] = await Promise.all([
    loadOrNotFound(() => api.getFeed(first ? {} : { cursor })),
    // Who you follow sits under the newest page only.
    first
      ? loadOrNotFound(() =>
          collectPages(async (next) => {
            const result = await api.listFollowing({ cursor: next, limit: 50 });
            return { items: result.artists, nextCursor: result.nextCursor };
          }),
        )
      : [],
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1>Feed</h1>
      {page.items.length === 0 ? (
        <p>
          {!first
            ? 'Nothing older.'
            : following.length === 0
              ? 'Follow artists from their pages to see their new public tracks here.'
              : 'Nothing new from the people you follow yet.'}
        </p>
      ) : (
        <ul>
          {page.items.map((item) => (
            <li key={item.versionId}>
              <Link href={`/@${item.artist.handle}`}>{name(item.artist)}</Link>{' '}
              {item.versionNumber === 1
                ? 'shared a new track'
                : `shared version ${item.versionNumber} of`}{' '}
              <Link href={`/tracks/${item.track.id}`}>{item.track.title}</Link> (
              {formatDuration(item.durationMs)}) · {formatDate(item.createdAt)}
            </li>
          ))}
        </ul>
      )}
      <p>
        {!first && <Link href="/feed">Newest</Link>}
        {!first && page.nextCursor && ' · '}
        {page.nextCursor && <Link href={`/feed?cursor=${page.nextCursor}`}>Older</Link>}
      </p>

      {first && following.length > 0 && (
        <>
          <h2>Following</h2>
          <ul>
            {following.map((artist) => (
              <li key={artist.handle}>
                <Link href={`/@${artist.handle}`}>{name(artist)}</Link> @{artist.handle}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
