'use client';

import { useSyncExternalStore } from 'react';
import {
  createAudioStore,
  initialPlayerState,
  queueIndex,
  type AudioStore,
  type PlayerState,
} from '../../lib/audio-store';
import { getStreamAction } from './actions';

/** The one player for the whole app. Its audio element is created on first play. */
/** Where the volume is remembered: this browser only, and never relied on (it may be blocked). */
const VOLUME_KEY = 'feedback:volume';

export const audioStore: AudioStore = createAudioStore({
  createAudio: () => new Audio(),
  fetchStream: getStreamAction,
  now: Date.now,
  memory:
    typeof window === 'undefined'
      ? undefined
      : {
          load: () => window.localStorage.getItem(VOLUME_KEY),
          save: (value) => window.localStorage.setItem(VOLUME_KEY, value),
        },
});

/**
 * Part of the player's state. Re-renders only when the selected value changes, so `select`
 * must return a primitive or a reference already in the state, never a new object.
 */
export function useAudio<T>(select: (state: PlayerState) => T): T {
  return useSyncExternalStore(
    audioStore.subscribe,
    () => select(audioStore.getState()),
    () => select(initialPlayerState),
  );
}

// Lock-screen and media-key controls (phones, headphones, keyboards).
if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
  const session = navigator.mediaSession;
  let shownVersionId: string | null = null;
  let skippable = false;
  audioStore.subscribe(() => {
    const state = audioStore.getState();
    const { item, status } = state;
    // Only offered while there's a queue, so a lone track's lock screen shows its seek controls.
    const canSkip = queueIndex(state) >= 0 && state.queue.length > 1;
    if (canSkip !== skippable) {
      skippable = canSkip;
      session.setActionHandler('nexttrack', canSkip ? () => void audioStore.next() : null);
      session.setActionHandler('previoustrack', canSkip ? () => void audioStore.previous() : null);
    }
    if (item && item.versionId !== shownVersionId) {
      shownVersionId = item.versionId;
      session.metadata = new MediaMetadata({ title: item.title, album: `v${item.versionNumber}` });
    }
    session.playbackState =
      status === 'playing' ? 'playing' : status === 'paused' ? 'paused' : 'none';
  });
  session.setActionHandler('play', () => void audioStore.resume());
  session.setActionHandler('pause', () => audioStore.pause());
  session.setActionHandler('seekto', (details) => {
    if (details.seekTime !== undefined) audioStore.seek(details.seekTime * 1000);
  });
}
