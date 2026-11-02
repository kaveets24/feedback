'use client';

import { useEffect, useState } from 'react';
import { ListenerProject, ListenerTrack } from '../_listen/listener-view';
import { openShareAction, type Shared } from './actions';

type State =
  { status: 'loading' } | { status: 'dead' } | { status: 'open'; token: string; shared: Shared };

/** Opens the share link in the page's fragment and shows what it's for. */
export function SharedView() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    async function open() {
      const token = decodeURIComponent(window.location.hash.slice(1));
      setState({ status: 'loading' });
      const shared = token ? await openShareAction(token) : null;
      if (!current) return;
      setState(shared ? { status: 'open', token, shared } : { status: 'dead' });
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
  return shared.kind === 'track' ? (
    <ListenerTrack track={shared.track} token={token} />
  ) : (
    <ListenerProject project={shared.project} tracks={shared.tracks} token={token} />
  );
}
