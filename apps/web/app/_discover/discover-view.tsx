import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  GENRE_LABELS,
  GENRE_OPTIONS,
  type DiscoverItem,
  type DiscoverResponse,
  type FollowedArtist,
  type Genre,
  type MeResponse,
} from '@feedback/shared';
import { formatDuration, formatShortDate } from '../../lib/format';
import { Avatar } from '../_shell/avatar';
import { DownIcon } from '../_shell/icons';
import { ResultRow } from './result-row';

export type Filters = { q?: string; genre?: Genre; cursor?: string };

/** Home with a search, genre, and cursor, leaving out whichever is unset. */
function href({ q, genre, cursor }: Filters) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (genre) query.set('genre', genre);
  if (cursor) query.set('cursor', cursor);
  return query.size ? `/?${query}` : '/';
}

/**
 * Discovery, for everyone: public tracks, the most recently updated first, narrowed by a genre
 * from the rail or a search, which also finds people. Every row plays in place in the
 * mini-player. The list is the same for everyone; signed out, a line says what this is, and
 * accounts waiting for approval (or not approved) see their status above it.
 */
export function DiscoverView({
  me,
  typed,
  q,
  genre,
  cursor,
  page,
  people,
}: Filters & {
  /** The signed-in account, or null signed out. */
  me: Pick<MeResponse, 'email' | 'accessStatus'> | null;
  /** What was typed in the search box, trimmed, even when too short to search. */
  typed: string;
  page: DiscoverResponse;
  people: FollowedArtist[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      {/* The results come first in the source, so the H1, search, and tracks lead for keyboards
          and screen readers; the grid places the rail to their left. */}
      <div className="md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8">
        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <h1 className="text-3xl font-semibold">Discover</h1>
          {me === null ? (
            <p className="mt-2 max-w-[60ch] text-muted">
              Public works in progress from people sharing rough ideas.{' '}
              <Link href="/sign-in" className="link">
                Sign in
              </Link>{' '}
              or{' '}
              <Link href="/sign-up" className="link">
                create an account
              </Link>{' '}
              to upload your own and leave feedback.
            </p>
          ) : (
            <p className="mt-2 text-muted">
              Public works in progress, the most recently updated first.
            </p>
          )}
          {me?.accessStatus === 'pending' && (
            <Notice title="You’re on the list">
              Feedback is invite-only for now. Your account (
              <span className="font-medium text-ink">{me.email}</span>) is waiting for approval.
              Until then you can listen to public tracks here.
            </Notice>
          )}
          {me?.accessStatus === 'rejected' && (
            <Notice title="Account not approved">
              Your account (<span className="font-medium text-ink">{me.email}</span>) wasn’t
              approved for access. You can still listen to public tracks here.
            </Notice>
          )}

          <SearchForm typed={typed} genre={genre} />
          {/* From md the genres are in the rail, after the results in the source. Absolute while
              focused (at its place in the flow), so showing it doesn't move the list. */}
          <a
            href="#genres"
            className="link sr-only rounded-sm text-sm focus:not-sr-only focus:absolute focus:mt-1 focus-glow max-md:hidden"
          >
            Skip to genres
          </a>
          {typed && !q && (
            <p role="status" className="mt-2 text-sm text-muted">
              Type at least 2 characters to search.
            </p>
          )}

          {q && !cursor && <People q={q} people={people} />}

          <section aria-labelledby="results-heading" className="mt-8">
            <h2 id="results-heading" className="mb-3 text-lg font-semibold">
              {q ? 'Tracks' : cursor ? 'Older' : 'Latest'}
              {genre && <span className="font-normal text-muted"> · {GENRE_LABELS[genre]}</span>}
            </h2>
            {page.items.length === 0 ? (
              <p className="border-y border-rule py-6 text-muted">
                {cursor
                  ? 'Nothing older.'
                  : q
                    ? `No public${genre ? ` ${GENRE_LABELS[genre]}` : ''} tracks match “${q}”.`
                    : genre
                      ? `No public ${GENRE_LABELS[genre]} tracks yet.`
                      : 'No public tracks yet.'}
                {genre && !cursor && (
                  <>
                    {' '}
                    <Link href={href({ q })} className="link">
                      Show all genres
                    </Link>
                  </>
                )}
              </p>
            ) : (
              <ul className="border-t border-rule">
                {page.items.map((item) => (
                  <ResultRow
                    key={item.track.id}
                    versionId={item.version.id}
                    trackId={item.track.id}
                    title={item.track.title}
                    versionNumber={item.version.versionNumber}
                  >
                    <ResultColumns item={item} />
                  </ResultRow>
                ))}
              </ul>
            )}
            <nav aria-label="More tracks" className="mt-4 flex gap-4 text-sm">
              {cursor && (
                <Link href={href({ q, genre })} className="link">
                  Newest
                </Link>
              )}
              {page.nextCursor && (
                <Link href={href({ q, genre, cursor: page.nextCursor })} className="link">
                  Older
                </Link>
              )}
            </nav>
          </section>
        </div>
        <GenreRail q={q} genre={genre} />
      </div>
    </main>
  );
}

/**
 * Every genre as a link, the current one lit like the version in the player. From `md` only; on
 * phones the search form's Genre select does the job. Links keep the search.
 */
function GenreRail({ q, genre }: Pick<Filters, 'q' | 'genre'>) {
  const choices: { value: Genre | undefined; label: string }[] = [
    { value: undefined, label: 'All genres' },
    ...GENRE_OPTIONS.map((value) => ({ value, label: GENRE_LABELS[value] })),
  ];
  return (
    <nav
      id="genres"
      aria-labelledby="genres-heading"
      className="hidden md:col-start-1 md:row-start-1 md:block"
    >
      {/* Lines up with the H1's cap height, so the rail and the results start together. */}
      <h2 id="genres-heading" className="mt-2.5 mb-2 text-sm font-semibold text-muted">
        Genres
      </h2>
      {/* Items bleed 12px into the gutter, so their words line up with the column edge. */}
      <ul className="-mx-3">
        {choices.map(({ value, label }) => {
          const current = value === genre;
          return (
            <li key={value ?? 'all'}>
              <Link
                href={href({ q, genre: value })}
                aria-current={current ? 'page' : undefined}
                className={`focus-glow block rounded-sm px-3 py-1 text-sm ${
                  current
                    ? 'bg-chrome-lo font-medium text-ink shadow-[inset_2px_0_0_var(--color-accent)]'
                    : 'text-muted hover:text-accent'
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Search, and on phones the genre too (the rail does it from `md`). The select stays in the form
 * when hidden, so a search keeps the genre the rail picked.
 */
function SearchForm({ typed, genre }: { typed: string; genre: Genre | undefined }) {
  return (
    <form action="/" role="search" className="mt-5 flex flex-wrap gap-2">
      <label htmlFor="search-q" className="sr-only">
        Search tracks and people
      </label>
      <input
        id="search-q"
        name="q"
        type="search"
        defaultValue={typed}
        maxLength={100}
        placeholder="Track, artist, or @handle"
        className="field w-full md:w-auto md:flex-1"
      />
      <label htmlFor="search-genre" className="sr-only">
        Genre
      </label>
      <div className="relative min-w-0 flex-1 md:hidden">
        <select
          id="search-genre"
          name="genre"
          defaultValue={genre ?? ''}
          className="field appearance-none pr-10"
        >
          <option value="">All genres</option>
          {GENRE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {GENRE_LABELS[option]}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">
          <DownIcon />
        </span>
      </div>
      <button type="submit" className="btn btn-primary">
        Search
      </button>
    </form>
  );
}

const artistName = (artist: DiscoverItem['artist']) =>
  artist.displayName ?? (artist.handle ? `@${artist.handle}` : 'Someone');

/** A row's title, its meta line, and from `sm` the length and date columns. */
function ResultColumns({ item }: { item: DiscoverItem }) {
  const { track, version, artist } = item;
  const length = formatDuration(version.durationMs);
  return (
    <>
      <div className="min-w-0">
        {/* Clamped on the paragraph, so the link stays inline and its focus ring hugs the words. */}
        <p className="line-clamp-2 font-medium break-words sm:line-clamp-1">
          <Link
            href={`/tracks/${track.id}`}
            className="rounded-sm group-data-playing:text-accent hover:text-accent focus-glow"
          >
            {track.title}
          </Link>
        </p>
        <p className="text-sm text-muted">
          {artist.handle ? (
            <Link
              href={`/@${artist.handle}`}
              className="rounded-sm text-ink hover:text-accent focus-glow"
            >
              {artistName(artist)}
            </Link>
          ) : (
            <span className="text-ink">{artistName(artist)}</span>
          )}
          {track.genre && ` · ${GENRE_LABELS[track.genre]}`} · v{version.versionNumber}
          {/* The length and date wrap as one, so a wrap never strands a dot at the line's end. */}
          <span className="whitespace-nowrap sm:hidden">
            {' · '}
            <span className="font-lcd text-base text-ink tabular-nums">{length}</span>
            {' · '}
            <time dateTime={version.createdAt}>{formatShortDate(version.createdAt)}</time>
          </span>
        </p>
      </div>
      <span className="hidden text-right font-lcd text-base tabular-nums sm:block">{length}</span>
      <time
        dateTime={version.createdAt}
        className="hidden text-right text-sm whitespace-nowrap text-muted sm:block"
      >
        {formatShortDate(version.createdAt)}
      </time>
    </>
  );
}

/** People matching a search: their picture, name, and handle, each a link to their page. */
function People({ q, people }: { q: string; people: FollowedArtist[] }) {
  return (
    <section aria-labelledby="people-heading" className="mt-8">
      <h2 id="people-heading" className="mb-3 text-lg font-semibold">
        People
      </h2>
      {people.length === 0 ? (
        <p className="border-y border-rule py-4 text-muted">No one matches “{q}”.</p>
      ) : (
        <ul className="border-t border-rule">
          {people.map((person) => (
            <li
              key={person.handle}
              className="relative flex items-center gap-3 border-b border-rule py-2.5 hover:bg-chrome-lo/60"
            >
              <Avatar avatar={person.avatar} size="header" />
              <Link href={`/@${person.handle}`} className="row-link min-w-0 truncate font-medium">
                {person.displayName ?? `@${person.handle}`}
              </Link>
              {person.displayName && (
                <span className="min-w-0 truncate text-sm text-muted">@{person.handle}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A status the account holder should know about, above the list. */
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="status"
      className="mt-5 max-w-[60ch] rounded-md border border-rule bg-chrome-lo px-4 py-3"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}
