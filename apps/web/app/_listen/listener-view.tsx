'use client';

import { SignInButton, useAuth } from '@clerk/nextjs';
import { useEffect, useMemo, useState } from 'react';
import type { ProjectDetailResponse, TrackResponse, VersionResponse } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { formatDate, formatDuration } from '../../lib/format';
import { listenerAction, listListenerFeedbackAction, type Listener } from '../_feedback/actions';
import { FeedbackPlaceContext } from '../_feedback/context';
import type { Threads } from '../_feedback/feedback-section';
import { PlayerWithFeedback } from '../_feedback/player-with-feedback';
import { ProjectCover } from '../projects/project-cover';

// What listeners see of a track or project: on the listen page through a share link, and on the
// track and project pages, with no link, for anyone but the owner of something public. Plain HTML
// until styled (CLAUDE.md section 9), apart from the player, cover art and comments.

const SHARED_BY_LINK =
  'Shared with you by link. You can listen, and comment once you’re signed in.';

/** A ready version as the player plays it, through the link if there is one. */
function playerItem(
  track: TrackResponse,
  version: VersionResponse,
  token: string | null,
): PlayerItem {
  return {
    versionId: version.id,
    trackId: track.id,
    title: track.title,
    versionNumber: version.versionNumber,
    durationMs: version.durationMs ?? 0,
    peaks: version.waveformPeaks ?? [],
    ...(token && { shareToken: token }),
  };
}

/**
 * The player for a track's current version, with A/B against its other versions, and the comments
 * on the version it shows, loaded as it's shown. Anyone who can see the track can read them; an
 * approved, signed-in visitor can comment, as themselves (and through the link, if there is one).
 */
function Player({ track, token }: { track: TrackResponse; token: string | null }) {
  // Listeners only get ready versions, newest first; the current one leads.
  const items = track.versions.map((v) => playerItem(track, v, token));
  const current = items.find((i) => i.versionId === track.currentVersionId);
  const { isSignedIn } = useAuth();
  const [listener, setListener] = useState<Listener | null>(null);
  const [shownId, setShownId] = useState(current?.versionId);
  const [feedback, setFeedback] = useState<Record<string, Threads>>({});

  // Who's here decides what the comments say they may do, so it's settled before they load, and
  // again after signing in or out (the sign-in is a modal, so the page and its link stay put).
  useEffect(() => {
    let live = true;
    void listenerAction().then((who) => live && setListener(who));
    return () => {
      live = false;
    };
  }, [isSignedIn]);

  // Bumped after each change to the comments, to load them again.
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (!listener || !shownId) return;
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
        canComment={listener === 'approved'}
        canEditPrompt={false}
        signIn={<SignInToComment listener={listener} />}
        onShow={setShownId}
      />
    </FeedbackPlaceContext.Provider>
  );
}

/** In the comment box's place for someone who can't comment (yet), saying why. */
function SignInToComment({ listener }: { listener: Listener | null }) {
  switch (listener) {
    case 'anonymous':
      return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* A modal, so the page (and the link in its address) stays put. */}
          <SignInButton mode="modal">
            <button type="button" className="btn">
              Sign in to comment
            </button>
          </SignInButton>
          <p className="text-sm text-muted">You can listen and read without an account.</p>
        </div>
      );
    case 'pending':
      return (
        <p className="text-sm text-muted">
          Your account is waiting for approval. You can comment once it’s approved.
        </p>
      );
    case 'rejected':
      return <p className="text-sm text-muted">Your account can’t comment.</p>;
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

/** A project as a listener sees it, with the tracks they may hear; see `ListenerTrack`. */
export function ListenerProject({
  project,
  tracks,
  token,
}: {
  project: ProjectDetailResponse;
  tracks: readonly TrackResponse[];
  token: string | null;
}) {
  const [selectedId, setSelectedId] = useState(tracks[0]?.id);
  const selected = tracks.find((t) => t.id === selectedId);

  return (
    <>
      <ProjectCover cover={project.cover} size="page" alt={`Cover art for ${project.title}`} />
      <h1>{project.title}</h1>
      {project.description && <p>{project.description}</p>}
      {token && <p>{SHARED_BY_LINK}</p>}
      {selected ? (
        <Player key={selected.id} track={selected} token={token} />
      ) : (
        <p>There’s nothing to play yet.</p>
      )}
      {tracks.length > 0 && (
        <>
          <h2>Tracks</h2>
          <ol>
            {tracks.map((track) => {
              const current = track.versions.find((v) => v.id === track.currentVersionId);
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    aria-pressed={track.id === selectedId}
                    onClick={() => setSelectedId(track.id)}
                  >
                    {track.title}
                  </button>{' '}
                  ({formatDuration(current?.durationMs ?? 0)})
                </li>
              );
            })}
          </ol>
        </>
      )}
    </>
  );
}
