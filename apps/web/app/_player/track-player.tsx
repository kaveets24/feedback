'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import type { PlaybackStatus, PlayerItem } from '../../lib/audio-store';
import { AbSwitch, type Side } from './ab-switch';
import { LcdTime } from './lcd-time';
import { audioStore, useAudio } from './store';
import { TransportButton } from './transport-button';
import { Waveform } from './waveform';

const STATE_LABELS: Record<PlaybackStatus, string> = {
  idle: 'Stopped',
  loading: 'Loading',
  playing: 'Playing',
  paused: 'Paused',
  error: 'Error',
};

/**
 * The track page's player. Shows the shared player's state when its version is the one loaded,
 * and starts it (from wherever the waveform is clicked) when it isn't. With more than one ready
 * version it can A/B the current version against an older one, switching at the same moment.
 */
export function TrackPlayer({
  current,
  older,
}: {
  current: PlayerItem;
  /** The track's other ready versions, newest first: what the current one can be compared with. */
  older: readonly PlayerItem[];
}) {
  const loadedId = useAudio((s) => s.item?.versionId);
  // B starts as an older version that's already playing (back on the page after switching to it),
  // otherwise the previous one.
  const [compareId, setCompareId] = useState(
    () => older.find((v) => v.versionId === audioStore.getState().item?.versionId)?.versionId,
  );
  const b = older.find((v) => v.versionId === compareId) ?? older[0];
  const [chosen, setChosen] = useState<Side>('a');
  // Whichever side is loaded wins, so the switch never disagrees with what's playing.
  const side: Side =
    loadedId === current.versionId ? 'a' : b && loadedId === b.versionId ? 'b' : chosen;
  const item = side === 'b' && b ? b : current;

  const isLoaded = (versionId: string | undefined) => versionId === item.versionId;
  const status = useAudio((s) => (isLoaded(s.item?.versionId) ? s.status : 'idle'));
  const positionMs = useAudio((s) => (isLoaded(s.item?.versionId) ? s.positionMs : 0));
  const error = useAudio((s) => (isLoaded(s.item?.versionId) ? s.error : null));
  const loaded = status !== 'idle';

  const toggle = () => void (loaded ? audioStore.toggle() : audioStore.play(item));
  const seek = (ms: number) => (loaded ? audioStore.seek(ms) : void audioStore.play(item, ms));

  /** Puts `next` in the player, taking over playback at the same moment if this player has it. */
  const show = (next: PlayerItem) => {
    if (loaded) void audioStore.switchTo(next);
  };
  const choose = (next: Side) => {
    if (!b || next === side) return;
    show(next === 'a' ? current : b);
    setChosen(next);
  };
  const compare = (versionId: string) => {
    const next = older.find((v) => v.versionId === versionId);
    if (!next) return;
    if (side === 'b') show(next);
    setCompareId(versionId);
  };

  // Once this player has the audio, get the other side's stream URL ready so a switch is quick.
  const otherId = b && (side === 'a' ? b.versionId : current.versionId);
  useEffect(() => {
    if (loaded && otherId) void audioStore.prefetch(otherId);
  }, [loaded, otherId]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target instanceof HTMLSelectElement)
      return;
    const key = event.key.toLowerCase();
    if (key !== 'a' && key !== 'b') return;
    event.preventDefault();
    choose(key);
  };

  return (
    <section
      aria-label={`Player for ${item.title}`}
      className="panel my-4 rounded-lg p-3 selection:bg-accent selection:text-canvas"
      onKeyDown={b ? onKeyDown : undefined}
    >
      <div className="flex items-center gap-3">
        <TransportButton status={status} title={item.title} size="lg" onClick={toggle} />
        <div className="lcd flex min-w-0 flex-1 items-baseline gap-2 px-3 py-1.5 font-lcd">
          <LcdTime ms={positionMs} className="text-2xl text-lcd-ink sm:text-3xl" />
          <span className="text-sm text-lcd-cyan sm:text-base">
            / <LcdTime ms={item.durationMs} />
          </span>
          <span className="ml-auto text-right text-xs text-lcd-cyan uppercase">
            v{item.versionNumber} {STATE_LABELS[status]}
          </span>
        </div>
      </div>
      <Waveform
        className="mt-3 h-24 sm:h-32"
        peaks={item.peaks}
        durationMs={item.durationMs}
        positionMs={positionMs}
        label={`Seek in ${item.title} v${item.versionNumber}`}
        onSeek={seek}
        onToggle={toggle}
      />
      {b && (
        <div className="mt-3">
          <AbSwitch
            a={current}
            b={b}
            older={older}
            side={side}
            onChoose={choose}
            onCompare={compare}
          />
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-sm bg-chrome-lo px-2 py-1 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
