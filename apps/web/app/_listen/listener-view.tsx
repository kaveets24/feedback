'use client';

import { SignInButton, useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { GENRE_LABELS, type ProjectDetailResponse, type TrackResponse } from '@feedback/shared';
import { formatDate, formatDuration } from '../../lib/format';
import { playerItem, queueItems } from '../../lib/player-item';
import { sharedTrackFragment } from '../../lib/share';
import { AlbumRow, PlayAlbumButton, useAlbumQueue } from '../_album/album';
import { ArtistLine } from '../_album/artist-line';
import { listenerAction, listListenerFeedbackAction, type Listener } from '../_feedback/actions';
import { FeedbackPlaceContext } from '../_feedback/context';
import type { Threads } from '../_feedback/feedback-section';
import { PlayerWithFeedback } from '../_feedback/player-with-feedback';
import { ProjectCover } from '../projects/project-cover';
import { ReleaseTypeBadge } from '../projects/release-type-badge';

// What listeners see of a track or project: on the listen page through a share link, and on the
// track and project pages, with no link, for anyone but the owner of something public. A track is
// plain HTML until styled (docs/frontend.md), apart from the player and comments.

const SHARED_BY_LINK =
  'Shared with you by link. You can listen, and read and leave comments once you’re signed in.';

/**
 * The player for a track's current version, with A/B against its other versions, and the comments
 * on the version it shows, loaded as it's shown. Only an approved, signed-in visitor gets the
 * comments: they read and write them as themselves (and through the link, if there is one). Anyone
 * else can listen, and is told what it would take.
 */
function Player({ track, token }: { track: TrackResponse; token: string | null }) {
  // Listeners only get ready versions, newest first; the current one leads.
  const items = track.versions.map((v) => playerItem(track, v, token));
  const current = items.find((i) => i.versionId === track.currentVersionId);
  const { isSignedIn } = useAuth();
  const [listener, setListener] = useState<Listener | null>(null);
  const [shownId, setShownId] = useState(current?.versionId);
  const [feedback, setFeedback] = useState<Record<string, Threads>>({});

  // Who's here decides whether comments load and what they may do with them, so it's settled
  // before they load, and again after signing in or out (the sign-in is a modal, so the page and
  // its link stay put). Signing out takes away any comments already on the page.
  useEffect(() => {
    let live = true;
    void listenerAction().then((who) => {
      if (!live) return;
      setListener(who);
      if (who !== 'approved') setFeedback({});
    });
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  // Bumped after each change to the comments, to load them again.
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (listener !== 'approved' || !shownId) return;
    let live = true;
    void listListenerFeedbackAction(token, shownId).then((result) => {
      if (!live) return;
      setFeedback((all) => ({ ...all, [shownId]: result.ok ? result.data.threads : null }));
    });
    return () => {
      live = false;
    };
  }, [listener, shownId, token, changes]);

  const place = useMemo(
    () => ({ shareToken: token ?? undefined, onChanged: () => setChanges((n) => n + 1) }),
    [token],
  );

  if (!current) return <p>There’s nothing to play yet.</p>;
  return (
    <FeedbackPlaceContext.Provider value={place}>
      <PlayerWithFeedback
        current={current}
        older={items.filter((i) => i !== current)}
        feedback={feedback}
        prompts={Object.fromEntries(track.versions.map((v) => [v.id, v.feedbackPrompt]))}
        // While it's still settling, the section says the comments are loading.
        canRead={listener === null || listener === 'approved'}
        canComment={listener === 'approved'}
        canEditPrompt={false}
        signIn={<CommentsNeedAccount listener={listener} />}
        onShow={setShownId}
      />
    </FeedbackPlaceContext.Provider>
  );
}

/** In the comment box's place for someone who can't read or write comments (yet), saying why. */
function CommentsNeedAccount({ listener }: { listener: Listener | null }) {
  switch (listener) {
    case 'anonymous':
      return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* A modal, so the page (and the link in its address) stays put. */}
          <SignInButton mode="modal">
            <button type="button" className="btn">
              Sign in to read and leave comments
            </button>
          </SignInButton>
          <p className="text-sm text-muted">You can listen without an account.</p>
        </div>
      );
    case 'pending':
      return (
        <p className="text-sm text-muted">
          Your account is waiting for approval. You can read and leave comments once it’s approved.
        </p>
      );
    case 'rejected':
      return <p className="text-sm text-muted">Your account can’t read or leave comments.</p>;
    default:
      return null;
  }
}

/**
 * A track as a listener sees it: by a share link (`token`), or with none because it's public.
 * Only ready versions reach listeners.
 */
export function ListenerTrack({ track, token }: { track: TrackResponse; token: string | null }) {
  return (
    <>
      <h1>{track.title}</h1>
      {track.genre && <p>Genre: {GENRE_LABELS[track.genre]}</p>}
      {token && <p>{SHARED_BY_LINK}</p>}
      <Player track={track} token={token} />
      <h2>Versions</h2>
      <ul>
        {track.versions.map((version) => (
          <li key={version.id}>
            v{version.versionNumber}
            {version.changeNotes && <>: {version.changeNotes}</>} (
            {formatDuration(version.durationMs ?? 0)},{' '}
            <time dateTime={version.createdAt}>{formatDate(version.createdAt)}</time>)
          </li>
        ))}
      </ul>
    </>
  );
}

/** A project as a listener sees it: an album to play, with comments on each track's own page. */
export function ListenerProject({
  project,
  tracks,
  token,
}: {
  project: ProjectDetailResponse;
  tracks: readonly TrackResponse[];
  token: string | null;
}) {
  const items = useMemo(() => queueItems(tracks, token), [tracks, token]);
  useAlbumQueue(project.id, items);
  const total = items.reduce((sum, item) => sum + item.durationMs, 0);

  return (
    <>
      <div className="flex items-start gap-4 sm:gap-6">
        <ProjectCover cover={project.cover} size="page" alt={`Cover art for ${project.title}`} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-semibold break-words text-balance">{project.title}</h1>
          <ArtistLine artist={project.artist} />
          {project.description && (
            <p className="mt-2 max-w-[65ch] whitespace-pre-line text-muted">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        {items.length > 0 && (
          <PlayAlbumButton projectId={project.id} title={project.title} items={items} />
        )}
        <ReleaseTypeBadge releaseType={project.releaseType} fit />
      </div>

      <section aria-labelledby="tracks-heading" className="mt-12">
        <div className="mb-3 flex items-baseline gap-3">
          <h2 id="tracks-heading" className="text-lg font-semibold">
            Tracks
          </h2>
          {tracks.length > 0 && (
            <p className="text-sm text-muted">
              {tracks.length === 1 ? '1 track' : `${tracks.length} tracks`}
              {' · '}
              <span className="font-lcd tabular-nums">{formatDuration(total)}</span>
            </p>
          )}
        </div>
        {tracks.length === 0 ? (
          <p className="border-y border-rule py-6 text-muted">There’s nothing to play yet.</p>
        ) : (
          <>
            <ol className="border-t border-rule">
              {tracks.map((track, index) => {
                const current = track.versions.find((v) => v.id === track.currentVersionId);
                const length = current?.durationMs != null && formatDuration(current.durationMs);
                return (
                  <AlbumRow
                    key={track.id}
                    projectId={project.id}
                    trackId={track.id}
                    title={track.title}
                    number={index + 1}
                    items={items}
                  >
                    <div className="min-w-0">
                      <TrackTitleLink track={track} token={token} />
                      <p className="text-sm text-muted">
                        {current && `v${current.versionNumber}`}
                        {length && (
                          <span className="sm:hidden">
                            {' · '}
                            <span className="font-lcd text-base text-ink tabular-nums">
                              {length}
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="hidden text-right font-lcd text-base tabular-nums sm:block">
                      {length || <span className="text-muted">—</span>}
                    </span>
                  </AlbumRow>
                );
              })}
            </ol>
            <p className="mt-4 max-w-[65ch] text-sm text-muted">
              {token ? 'Shared with you by link. ' : ''}Open a track to read and leave comments.
            </p>
          </>
        )}
      </section>
    </>
  );
}

/**
 * A track's title, going to where a listener can read and leave comments on it. Through a share
 * link that's the same page with the track in the fragment, so it's a plain link: only a real
 * fragment change tells the page, and the token stays out of anything a server sees.
 */
function TrackTitleLink({ track, token }: { track: TrackResponse; token: string | null }) {
  const className =
    'link line-clamp-2 font-medium break-words no-underline group-data-playing:text-accent sm:line-clamp-1';
  return token ? (
    <a
      href={sharedTrackFragment(token, track.id)}
      className={className}
      onClick={() => document.querySelector('main')?.scrollIntoView()}
    >
      {track.title}
    </a>
  ) : (
    <Link href={`/tracks/${track.id}`} className={className}>
      {track.title}
    </Link>
  );
}
