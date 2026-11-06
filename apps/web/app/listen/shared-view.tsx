'use client';

import { useEffect, useRef, useState } from 'react';
import { parseShareFragment } from '../../lib/share';
import { ListenerProject, ListenerTrack } from '../_listen/listener-view';
import { openShareAction, type Shared } from './actions';

type State =
  { status: 'loading' } | { status: 'dead' } | { status: 'open'; token: string; shared: Shared };

/**
 * Opens the share link in the page's fragment and shows what it's for: a track, a project, or one
 * track of a project (`#<token>/<trackId>`), which is where its comments are.
 */
export function SharedView() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const [trackId, setTrackId] = useState<string | null>(null);
  /** The link already open, so moving between its tracks doesn't open it again. */
  const opened = useRef<string | null>(null);

  useEffect(() => {
    let current = true;
    async function open() {
      const fragment = parseShareFragment(window.location.hash);
      setTrackId(fragment.trackId);
      if (fragment.token === opened.current) return;
      opened.current = null;
      setState({ status: 'loading' });
      const shared = fragment.token ? await openShareAction(fragment.token) : null;
      if (!current) return;
      opened.current = shared && fragment.token;
      setState(shared ? { status: 'open', token: fragment.token, shared } : { status: 'dead' });
    }
    void open();
    window.addEventListener('hashchange', open);
    return () => {
      current = false;
      window.removeEventListener('hashchange', open);
    };
  }, []);

  if (state.status === 'loading') return <p role="status">Opening the link…</p>;
  if (state.status === 'dead') {
    return (
      <>
        <h1>This link doesn’t work</h1>
        <p>
          It may have been turned off, or it may have expired. Ask the person who shared it with you
          for a new one.
        </p>
      </>
    );
  }
  const { token, shared } = state;
  if (shared.kind === 'track') return <ListenerTrack track={shared.track} token={token} />;
  // A track outside this project (or a stale link to one) just opens the project.
  const track = shared.tracks.find((t) => t.id === trackId);
  return track ? (
    <>
      <p className="mb-3 text-sm">
        <a href={`#${token}`} className="link text-muted">
          {shared.project.title}
        </a>
      </p>
      {/* Keyed, so its player's A/B choice doesn't carry over from the last track. */}
      <ListenerTrack key={track.id} track={track} token={token} />
    </>
  ) : (
    <ListenerProject project={shared.project} tracks={shared.tracks} token={token} />
  );
}
