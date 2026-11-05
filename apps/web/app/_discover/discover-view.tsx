import { SignInButton, SignUpButton } from '@clerk/nextjs';
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
import { UnderlineTabs } from '../_shell/tabs';
import { href, type Filters } from './filters';
import { GenreSelect } from './genre-select';
import { ResultRow } from './result-row';

/** The search form's id, for the genre select that belongs to it from beside the results. */
const SEARCH_FORM = 'discover-search';

/**
 * Discovery, for everyone: public tracks, the most recently updated first, narrowed by a genre
 * from the rail or a search, which also finds people. Every row plays in place in the
 * mini-player. The list is the same for everyone; signed out, a line says what this is, and
 * accounts waiting for approval (or not approved) see their status above it. Approved accounts
 * also get Everyone and Following tabs; Following keeps only the people they follow, who are
 * listed in the rail.
 */
export function DiscoverView({
  me,
  view = 'everyone',
  following,
  typed,
  q,
  genre,
  cursor,
  page,
  people,
}: Filters & {
  /** The signed-in account, or null signed out. */
  me: Pick<MeResponse, 'email' | 'accessStatus'> | null;
  /** Who they follow, on the Following view (null on Everyone). */
  following: FollowedArtist[] | null;
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
              Share your song ideas, give feedback to others, and build community.{' '}
              <SignInButton mode="modal">
                <button type="button" className="link">
                  Sign in
                </button>
              </SignInButton>{' '}
              or{' '}
              <SignUpButton mode="modal">
                <button type="button" className="link">
                  create an account
                </button>
              </SignUpButton>{' '}
              to join in.
            </p>
          ) : (
            <p className="mt-2 text-muted">
              Share your song ideas, give feedback to others, and build community.
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

          {me?.accessStatus === 'approved' && (
            <UnderlineTabs
              label="Whose tracks"
              className="mt-5"
              items={[
                { label: 'Everyone', href: href({ q, genre }), current: view === 'everyone' },
                {
                  label: 'Following',
                  href: href({ view: 'following', q, genre }),
                  current: view === 'following',
                },
              ]}
            />
          )}
          <SearchForm typed={typed} view={view} />
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
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="results-heading" className="min-w-0 text-lg font-semibold">
                {q ? 'Tracks' : cursor ? 'Older' : 'Latest'}
                {/* On phones the select beside it already says which genre. */}
                {genre && (
                  <span className="font-normal text-muted max-md:hidden">
                    {' '}
                    · {GENRE_LABELS[genre]}
                  </span>
                )}
              </h2>
              <GenreSelect form={SEARCH_FORM} view={view} q={q} genre={genre} />
            </div>
            {page.items.length === 0 ? (
              <p className="border-y border-rule py-6 text-muted">
                {cursor
                  ? 'Nothing older.'
                  : view === 'following' && following?.length === 0
                    ? 'You don’t follow anyone yet. Follow artists from their pages to see their public tracks here.'
                    : view === 'following' && !q && !genre
                      ? 'Nothing public from the people you follow yet.'
                      : q
                        ? `No public${genre ? ` ${GENRE_LABELS[genre]}` : ''} tracks match “${q}”.`
                        : genre
                          ? `No public ${GENRE_LABELS[genre]} tracks yet.`
                          : 'No public tracks yet.'}
                {genre && !cursor && (
                  <>
                    {' '}
                    <Link href={href({ view, q })} className="link">
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
                <Link href={href({ view, q, genre })} className="link">
                  Newest
                </Link>
              )}
              {page.nextCursor && (
                <Link href={href({ view, q, genre, cursor: page.nextCursor })} className="link">
                  Older
                </Link>
              )}
            </nav>
          </section>
          {following && following.length > 0 && (
            <FollowingList artists={following} id="following-phone" className="mt-10 md:hidden" />
          )}
        </div>
        <GenreRail view={view} q={q} genre={genre} following={following} />
      </div>
    </main>
  );
}

/**
 * Every genre as a link, the current one lit like the version in the player, and on the
 * Following view who they follow. From `md` only; on phones the select beside the results' heading
 * does the genres' job, and the people they follow sit under the results. Links keep the view and
 * search.
 */
function GenreRail({
  view,
  q,
  genre,
  following,
}: Pick<Filters, 'view' | 'q' | 'genre'> & { following: FollowedArtist[] | null }) {
  const showFollowing = following !== null && following.length > 0;
  const choices: { value: Genre | undefined; label: string }[] = [
    { value: undefined, label: 'All' },
    ...GENRE_OPTIONS.map((value) => ({ value, label: GENRE_LABELS[value] })),
  ];
  return (
    <div className="hidden md:col-start-1 md:row-start-1 md:block">
      {/* Who they follow leads the rail on Following, above the long genre list. Either way the
          first heading lines up with the H1's cap height, so the rail and the results start
          together. */}
      {showFollowing && (
        <FollowingList artists={following} id="following-rail" className="mt-2.5 mb-8" />
      )}
      <nav id="genres" aria-labelledby="genres-heading">
        <h2
          id="genres-heading"
          className={`mb-2 text-sm font-semibold text-muted ${showFollowing ? '' : 'mt-2.5'}`}
        >
          Genre
        </h2>
        {/* Items bleed 12px into the gutter, so their words line up with the column edge. */}
        <ul className="-mx-3">
          {choices.map(({ value, label }) => {
            const current = value === genre;
            return (
              <li key={value ?? 'all'}>
                <Link
                  href={href({ view, q, genre: value })}
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
    </div>
  );
}

/** Who they follow, each a link to their page. Shown in the rail, or on phones under the list. */
function FollowingList({
  artists,
  id,
  className,
}: {
  artists: FollowedArtist[];
  /** The heading's id; the rail and phone copies need their own. */
  id: string;
  className: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="mb-2 text-sm font-semibold text-muted">
        You follow
      </h2>
      <ul className="flex flex-col gap-1">
        {artists.map((artist) => (
          <li key={artist.handle} className="flex min-w-0 items-center gap-2">
            <Avatar avatar={artist.avatar} size="inline" />
            <Link
              href={`/@${artist.handle}`}
              className="min-w-0 truncate rounded-sm text-sm hover:text-accent focus-glow"
            >
              {artist.displayName ?? `@${artist.handle}`}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Search. The genre goes with it, from the select beside the results (see `GenreSelect`). */
function SearchForm({ typed, view }: { typed: string; view: Filters['view'] }) {
  return (
    <form id={SEARCH_FORM} action="/" role="search" className="mt-5 flex gap-2">
      {view === 'following' && <input type="hidden" name="view" value="following" />}
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
        className="field min-w-0 flex-1"
      />
      <button type="submit" className="btn btn-primary shrink-0">
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
