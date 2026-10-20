'use client';

import { useEffect, useState } from 'react';
import type { TrackResponse, VersionResponse } from '@feedback/shared';
import type { PlayerItem } from '../../lib/audio-store';
import { formatDate, formatDuration } from '../../lib/format';
import { TrackPlayer } from '../_player/track-player';
import { ProjectCover } from '../projects/project-cover';
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
    <SharedTrack track={shared.track} token={token} />
  ) : (
    <SharedProject shared={shared} token={token} />
  );
}

/** A ready version as the player plays it, through the link. */
function playerItem(track: TrackResponse, version: VersionResponse, token: string): PlayerItem {
  return {
    versionId: version.id,
    trackId: track.id,
    title: track.title,
    versionNumber: version.versionNumber,
    durationMs: version.durationMs ?? 0,
    peaks: version.waveformPeaks ?? [],
    shareToken: token,
  };
}

/** The player for a track's current version, with A/B against its other versions. */
function Player({ track, token }: { track: TrackResponse; token: string }) {
  // Listeners only get ready versions, newest first; the current one leads.
  const items = track.versions.map((v) => playerItem(track, v, token));
  const current = items.find((i) => i.versionId === track.currentVersionId);
  if (!current) return <p>There’s nothing to play yet.</p>;
  return <TrackPlayer current={current} older={items.filter((i) => i !== current)} />;
}

function SharedTrack({ track, token }: { track: TrackResponse; token: string }) {
  return (
    <>
      <h1>{track.title}</h1>
      <p>Shared with you by link. You can listen.</p>
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

function SharedProject({
  shared,
  token,
}: {
  shared: Extract<Shared, { kind: 'project' }>;
  token: string;
}) {
  const { project, tracks } = shared;
  const [selectedId, setSelectedId] = useState(tracks[0]?.id);
  const selected = tracks.find((t) => t.id === selectedId);

  return (
    <>
      <ProjectCover cover={project.cover} size="page" alt={`Cover art for ${project.title}`} />
      <h1>{project.title}</h1>
      {project.description && <p>{project.description}</p>}
      <p>Shared with you by link. You can listen.</p>
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
