import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';
import {
  GENRE_LABELS,
  GENRE_OPTIONS,
  genreSchema,
  searchTermSchema,
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

/** This page with a search, genre, and cursor, leaving out whichever is unset. */
function href({ q, genre, cursor }: { q?: string; genre?: Genre; cursor?: string }) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (genre) query.set('genre', genre);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `/discover?${query}` : '/discover';
}

/**
 * Public tracks for anyone, signed in or not: the most recently updated first, optionally one
 * genre, or those matching a search, which also finds people. The same for everyone. Plain HTML
 * until it's styled (CLAUDE.md section 9).
 */
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; genre?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  // A hand-edited URL shows everything, or the first page, rather than an error.
  const genre = genreSchema.safeParse(params.genre).data;
  const cursor = z.uuid().safeParse(params.cursor).data;
  const typed = typeof params.q === 'string' ? params.q.trim() : '';
  // Too short (or long) to search: say so, and show everything meanwhile.
  const q = searchTermSchema.safeParse(typed).data;

  const api = await viewerApi();
  const [page, people] = await Promise.all([
    api.discover({ q, genre, cursor }),
    // People sit above the first page of tracks only.
    q && !cursor ? api.searchProfiles({ q }).then((found) => found.artists) : [],
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1>Discover</h1>
      <p>Public tracks from everyone, the most recently updated first.</p>

      <form action="/discover" role="search">
        <label htmlFor="discover-q">Search</label>{' '}
        <input
          id="discover-q"
          name="q"
          type="search"
          defaultValue={typed}
          maxLength={100}
          placeholder="Track, artist, or @handle"
        />{' '}
        <label htmlFor="discover-genre">Genre</label>{' '}
        <select id="discover-genre" name="genre" defaultValue={genre ?? ''}>
          <option value="">All genres</option>
          {GENRE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {GENRE_LABELS[option]}
            </option>
          ))}
        </select>{' '}
        <button type="submit">Search</button>
      </form>
      {typed && !q && <p role="status">Type at least 2 characters to search.</p>}

      {q && !cursor && (
        <>
          <h2>People</h2>
          {people.length === 0 ? (
            <p>No one matches “{q}”.</p>
          ) : (
            <ul>
              {people.map((artist) => (
                <li key={artist.handle}>
                  <Link href={`/@${artist.handle}`}>
                    {artist.displayName ?? `@${artist.handle}`}
                  </Link>{' '}
                  @{artist.handle}
                </li>
              ))}
            </ul>
          )}
          <h2>Tracks</h2>
        </>
      )}

      {page.items.length === 0 ? (
        <p>
          {cursor
            ? 'Nothing older.'
            : q
              ? `No public${genre ? ` ${GENRE_LABELS[genre]}` : ''} tracks match “${q}”.`
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
        {cursor && <Link href={href({ q, genre })}>Newest</Link>}
        {cursor && page.nextCursor && ' · '}
        {page.nextCursor && <Link href={href({ q, genre, cursor: page.nextCursor })}>Older</Link>}
      </p>
    </main>
  );
}
