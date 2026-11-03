import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import {
  GENRE_LABELS,
  GENRE_OPTIONS,
  genreSchema,
  type DiscoverItem,
  type Genre,
} from '@feedback/shared';
import { viewerApi } from '../../lib/api';
import { formatDate, formatDuration } from '../../lib/format';

export const metadata: Metadata = { title: 'Discover · Feedback' };

function Artist({ artist }: { artist: DiscoverItem['artist'] }) {
  const name = artist.displayName ?? (artist.handle ? `@${artist.handle}` : 'Someone');
  return artist.handle ? <Link href={`/@${artist.handle}`}>{name}</Link> : <>{name}</>;
}

/** This page with a genre and cursor, leaving out whichever is unset. */
function href(genre: Genre | undefined, cursor?: string) {
  const query = new URLSearchParams();
  if (genre) query.set('genre', genre);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `/discover?${query}` : '/discover';
}

/**
 * Public tracks for anyone, signed in or not: the most recently updated first, optionally one
 * genre. The same list for everyone. Plain HTML until it's styled (CLAUDE.md section 9).
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ genre?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  // A hand-edited URL shows everything, or the first page, rather than an error.
  const genre = genreSchema.safeParse(params.genre).data;
  const cursor = z.uuid().safeParse(params.cursor).data;
  const page = await (await viewerApi()).discover({ genre, cursor });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1>Discover</h1>
      <p>Public tracks from everyone, the most recently updated first.</p>

      <form action="/discover">
        <label htmlFor="discover-genre">Genre</label>{' '}
        <select id="discover-genre" name="genre" defaultValue={genre ?? ''}>
          <option value="">All genres</option>
          {GENRE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {GENRE_LABELS[option]}
            </option>
          ))}
        </select>{' '}
        <button type="submit">Show</button>
      </form>

      {page.items.length === 0 ? (
        <p>
          {cursor
            ? 'Nothing older.'
            : genre
              ? `No public ${GENRE_LABELS[genre]} tracks yet.`
              : 'No public tracks yet.'}
        </p>
      ) : (
        <ul>
          {page.items.map((item) => (
            <li key={item.track.id}>
              <Link href={`/tracks/${item.track.id}`}>{item.track.title}</Link> by{' '}
              <Artist artist={item.artist} />
              {item.track.genre && <> · {GENRE_LABELS[item.track.genre]}</>} · v
              {item.version.versionNumber} ({formatDuration(item.version.durationMs)}) ·{' '}
              <time dateTime={item.version.createdAt}>{formatDate(item.version.createdAt)}</time>
            </li>
          ))}
        </ul>
      )}
      <p>
        {cursor && <Link href={href(genre)}>Newest</Link>}
        {cursor && page.nextCursor && ' · '}
        {page.nextCursor && <Link href={href(genre, page.nextCursor)}>Older</Link>}
      </p>
    </main>
  );
}
