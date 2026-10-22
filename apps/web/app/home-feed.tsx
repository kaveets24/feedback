import Link from 'next/link';
import { z } from 'zod';
import type { FollowedArtist } from '@feedback/shared';
import { serverApi } from '../lib/api';
import { formatDate, formatDuration } from '../lib/format';
import { loadOrNotFound } from '../lib/load';
import { collectPages } from '../lib/pages';

const name = (artist: FollowedArtist) => artist.displayName ?? `@${artist.handle}`;

/**
 * Home for an approved account: new public work by the people they follow, newest first (each
 * new track, and each new version of one), and under it who they follow. Plain HTML until it's
 * styled (CLAUDE.md section 9).
 */
export async function HomeFeed({ cursor }: { cursor: string | undefined }) {
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
          {!first ? (
            'Nothing older.'
          ) : following.length === 0 ? (
            // Likely a new account, so it also says where their own work lives.
            <>
              Follow artists from their pages to see their new public tracks here. To upload your
              own, go to <Link href="/tracks">Tracks</Link>.
            </>
          ) : (
            'Nothing new from the people you follow yet.'
          )}
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
        {!first && <Link href="/">Newest</Link>}
        {!first && page.nextCursor && ' · '}
        {page.nextCursor && <Link href={`/?cursor=${page.nextCursor}`}>Older</Link>}
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
