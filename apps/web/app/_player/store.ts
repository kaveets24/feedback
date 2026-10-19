'use client';

import { useSyncExternalStore } from 'react';
import {
  createAudioStore,
  initialPlayerState,
  type AudioStore,
  type PlayerState,
} from '../../lib/audio-store';
import { getStreamAction } from './actions';

/** The one player for the whole app. Its audio element is created on first play. */
export const audioStore: AudioStore = createAudioStore({
  createAudio: () => new Audio(),
  fetchStream: getStreamAction,
  now: Date.now,
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
  audioStore.subscribe(() => {
    const { item, status } = audioStore.getState();
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
