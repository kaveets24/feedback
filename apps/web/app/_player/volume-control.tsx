'use client';

import type { CSSProperties } from 'react';
import { SpeakerIcon, SpeakerMutedIcon } from '../_shell/icons';
import { audioStore, useAudio } from './store';

const SIZES = {
  /** In the track page's player panel: a 44px mute button, a 12rem fader, and the level. */
  panel: { button: 'size-11', fader: 'w-48', icon: 20, readout: true },
  /** In the mini-player: a 40px button and a short fader, from `sm`. */
  mini: { button: 'size-10', fader: 'w-24 max-sm:hidden', icon: 18, readout: false },
} as const;

/**
 * Mute and a hardware fader for the one shared player, so every player shows the same level.
 * The level is remembered between visits (see the audio store). Phones and tablets get the mute
 * button only: iOS ignores a page's volume (the hardware buttons own it), so a fader there would
 * do nothing.
 */
export function VolumeControl({ size }: { size: keyof typeof SIZES }) {
  const volume = useAudio((s) => s.volume);
  const muted = useAudio((s) => s.muted);
  const { button, fader, icon, readout } = SIZES[size];
  // What you hear: muted reads as zero, and the fader shows it.
  const level = muted ? 0 : Math.round(volume * 100);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className={`bevel-button ${button} ${muted ? 'text-accent' : ''}`}
        aria-label={muted ? 'Unmute' : 'Mute'}
        aria-pressed={muted}
        onClick={audioStore.toggleMute}
      >
        {muted ? <SpeakerMutedIcon size={icon} /> : <SpeakerIcon size={icon} />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={level}
        aria-label="Volume"
        aria-valuetext={muted ? 'Muted' : `${level}%`}
        onChange={(event) => audioStore.setVolume(Number(event.target.value) / 100)}
        className={`fader ${fader} pointer-coarse:hidden`}
        style={{ '--fill': `${level}%` } as CSSProperties}
      />
      {readout && (
        <span
          aria-hidden="true"
          className="lcd w-12 px-2 py-1 text-right font-lcd text-xs text-lcd-ink tabular-nums pointer-coarse:hidden"
        >
          {muted ? 'MUTE' : level}
        </span>
      )}
    </div>
  );
}
