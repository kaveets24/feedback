import type { ActionResult } from './action-result';

/** What the player is playing: one ready version of a track. */
export type PlayerItem = {
  versionId: string;
  trackId: string;
  title: string;
  versionNumber: number;
  durationMs: number;
  peaks: readonly number[];
};

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type PlayerState = {
  item: PlayerItem | null;
  status: PlaybackStatus;
  positionMs: number;
  /** Shown to the listener when `status` is `error`. */
  error: string | null;
};

/** The parts of `HTMLAudioElement` the store uses, so tests can pass a fake. */
export type AudioLike = Pick<
  HTMLAudioElement,
  'src' | 'currentTime' | 'paused' | 'play' | 'pause' | 'addEventListener'
>;

export type StreamUrl = { url: string; expiresAt: string };

export type AudioStoreDeps = {
  createAudio: () => AudioLike;
  fetchStream: (versionId: string) => Promise<ActionResult<StreamUrl>>;
  now: () => number;
};

/** Treat a stream URL as expired this long before it really does, so a resume never races it. */
export const EXPIRY_MARGIN_MS = 30_000;

export const initialPlayerState: PlayerState = {
  item: null,
  status: 'idle',
  positionMs: 0,
  error: null,
};

/**
 * The app's one audio player (CLAUDE.md section 9): owns a single audio element, so only one
 * track ever plays. Stream URLs are short-lived, so it fetches a new one when the current one
 * has expired before a resume, or when playback fails (a later range request with an expired
 * URL), and carries on from the same position.
 */
export function createAudioStore({ createAudio, fetchStream, now }: AudioStoreDeps) {
  let state = initialPlayerState;
  const listeners = new Set<() => void>();
  let audio: AudioLike | null = null;
  let expiresAt = 0;
  /** Where to start once the next source has loaded its metadata. */
  let pendingSeekMs: number | null = null;
  /** Bumped by every new source, so an older fetch that finishes late is ignored. */
  let loadId = 0;
  /** Set after one URL refresh for a playback error, cleared once playback works again. */
  let retried = false;

  /** Pressing play again retries: from `error`, a resume fetches a fresh stream URL. */
  function playbackError() {
    const version = state.item ? `v${state.item.versionNumber}` : 'this version';
    return `Couldn’t play ${version}. Press play to try again.`;
  }

  function set(patch: Partial<PlayerState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function element(): AudioLike {
    if (audio) return audio;
    const el = createAudio();
    el.addEventListener('loadedmetadata', () => {
      if (pendingSeekMs !== null) el.currentTime = pendingSeekMs / 1000;
      pendingSeekMs = null;
    });
    el.addEventListener('playing', () => {
      retried = false;
      set({ status: 'playing', error: null });
    });
    el.addEventListener('pause', () => {
      if (state.status === 'playing') set({ status: 'paused' });
    });
    el.addEventListener('timeupdate', () => {
      if (pendingSeekMs === null) set({ positionMs: Math.round(el.currentTime * 1000) });
    });
    el.addEventListener('ended', () => {
      set({ status: 'paused', positionMs: state.item?.durationMs ?? state.positionMs });
    });
    el.addEventListener('error', () => {
      if (!state.item) return;
      if (retried) {
        set({ status: 'error', error: playbackError() });
        return;
      }
      retried = true;
      void loadSource(state.item.versionId, state.status !== 'paused');
    });
    audio = el;
    return el;
  }

  /**
   * Fetches a fresh stream URL and points the element at it, starting from `positionMs`. Seeks
   * made while it loads move that start rather than the old source.
   */
  async function loadSource(versionId: string, autoplay: boolean) {
    const id = ++loadId;
    const el = element();
    pendingSeekMs = state.positionMs;
    if (autoplay) set({ status: 'loading', error: null });
    const result = await fetchStream(versionId).catch(() => null);
    if (id !== loadId) return;
    if (!result?.ok) {
      pendingSeekMs = null;
      set({ status: 'error', error: playbackError() });
      return;
    }
    expiresAt = Date.parse(result.data.expiresAt);
    el.src = result.data.url;
    if (autoplay) await startPlayback(el);
  }

  async function startPlayback(el: AudioLike) {
    try {
      await el.play();
    } catch (err) {
      // Interrupted by a pause or a new source: not a failure.
      if (err instanceof Error && err.name === 'AbortError') return;
      set({ status: 'error', error: playbackError() });
    }
  }

  function seek(ms: number) {
    if (!state.item) return;
    const positionMs = Math.min(Math.max(0, Math.round(ms)), state.item.durationMs);
    if (pendingSeekMs !== null) pendingSeekMs = positionMs;
    else if (audio) audio.currentTime = positionMs / 1000;
    set({ positionMs });
  }

  async function resume() {
    const { item } = state;
    if (!item) return;
    if (state.status === 'error' || now() >= expiresAt - EXPIRY_MARGIN_MS) {
      await loadSource(item.versionId, true);
      return;
    }
    set({ status: 'loading' });
    await startPlayback(element());
  }

  function pause() {
    audio?.pause();
    // Drops a stream URL fetch still in flight, so it doesn't start playing when it lands; the
    // next resume fetches again.
    if (state.status === 'loading') {
      loadId++;
      expiresAt = 0;
    }
    if (state.status === 'playing' || state.status === 'loading') set({ status: 'paused' });
  }

  /** Plays `item` (from `atMs` if given), switching from whatever was playing. */
  async function play(item: PlayerItem, atMs?: number) {
    if (state.item?.versionId === item.versionId && state.status !== 'error') {
      if (atMs !== undefined) seek(atMs);
      await resume();
      return;
    }
    audio?.pause();
    retried = false;
    expiresAt = 0;
    set({ item, status: 'loading', positionMs: atMs ?? 0, error: null });
    await loadSource(item.versionId, true);
  }

  async function toggle() {
    if (state.status === 'playing' || state.status === 'loading') pause();
    else await resume();
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    play,
    resume,
    pause,
    toggle,
    seek,
  };
}

export type AudioStore = ReturnType<typeof createAudioStore>;
