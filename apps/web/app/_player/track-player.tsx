'use client';

import type { PlaybackStatus, PlayerItem } from '../../lib/audio-store';
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
 * The track page's player for one version. Shows the shared player's state when that version is
 * the one loaded, and starts it (from wherever the waveform is clicked) when it isn't.
 */
export function TrackPlayer({ item }: { item: PlayerItem }) {
  const isLoaded = (versionId: string | undefined) => versionId === item.versionId;
  const status = useAudio((s) => (isLoaded(s.item?.versionId) ? s.status : 'idle'));
  const positionMs = useAudio((s) => (isLoaded(s.item?.versionId) ? s.positionMs : 0));
  const error = useAudio((s) => (isLoaded(s.item?.versionId) ? s.error : null));
  const loaded = status !== 'idle';

  const toggle = () => void (loaded ? audioStore.toggle() : audioStore.play(item));
  const seek = (ms: number) => (loaded ? audioStore.seek(ms) : void audioStore.play(item, ms));

  return (
    <section
      aria-label={`Player for v${item.versionNumber}`}
      className="panel my-4 rounded-lg p-3 selection:bg-accent selection:text-canvas"
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
      {error && (
        <p role="alert" className="mt-3 rounded-sm bg-chrome-lo px-2 py-1 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
