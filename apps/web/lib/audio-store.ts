import type { ActionResult } from './action-result';

/** What the player is playing: one ready version of a track. */
export type PlayerItem = {
  versionId: string;
  trackId: string;
  title: string;
  versionNumber: number;
  durationMs: number;
  peaks: readonly number[];
  /** The share link it was opened with, for someone listening through one (never logged). */
  shareToken?: string;
};

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type PlayerState = {
  item: PlayerItem | null;
  status: PlaybackStatus;
  positionMs: number;
  /** Shown to the listener when `status` is `error`. */
  error: string | null;
  /** 0 to 1, shared by every player; kept while muted, so unmuting goes back to it. */
  volume: number;
  muted: boolean;
  /** The tracks playing in order (a project's), with one version of each; empty for a lone track. */
  queue: readonly PlayerItem[];
  /** What the queue came from, so that place can keep it up to date. */
  queueId: string | null;
};

/** The parts of `HTMLAudioElement` the store uses, so tests can pass a fake. */
export type AudioLike = Pick<
  HTMLAudioElement,
  'src' | 'currentTime' | 'paused' | 'play' | 'pause' | 'addEventListener' | 'volume' | 'muted'
>;

/** Where the volume is remembered between visits (the browser's storage; tests pass a fake). */
export type VolumeMemory = { load: () => string | null; save: (value: string) => void };

export type StreamUrl = { url: string; expiresAt: string };

/** What the mini-player draws for a version: fetched later for an item a list built without it. */
export type WaveformData = Pick<PlayerItem, 'peaks' | 'durationMs'>;

export type AudioStoreDeps = {
  createAudio: () => AudioLike;
  fetchStream: (versionId: string, shareToken?: string) => Promise<ActionResult<StreamUrl>>;
  now: () => number;
  memory?: VolumeMemory;
  /**
   * A version's waveform, for an item with no peaks (a list leaves them out): fetched while it
   * plays, never before, so audio never waits on it.
   */
  fetchWaveform?: (item: PlayerItem) => Promise<WaveformData | null>;
};

/** Treat a stream URL as expired this long before it really does, so a resume never races it. */
export const EXPIRY_MARGIN_MS = 30_000;

/** Further into a track than this, "previous" goes back to its start rather than the last track. */
export const RESTART_AFTER_MS = 3_000;

/**
 * With this long left of a track, the next one's stream URL is fetched, so it can start straight
 * from the `ended` event: phones may refuse to start audio after a wait while the screen's locked.
 * Any earlier and a long track's wait could outlast the URL.
 */
export const PREPARE_NEXT_MS = 60_000;

/** How long to wait before fetching the next track's stream URL again, if that failed. */
const PREPARE_RETRY_MS = 30_000;

export const initialPlayerState: PlayerState = {
  item: null,
  status: 'idle',
  positionMs: 0,
  error: null,
  volume: 1,
  muted: false,
  queue: [],
  queueId: null,
};

/**
 * Where the loaded track is in the queue, or -1. Goes by track, not version: comparing an older
 * version (A/B) keeps its place.
 */
export function queueIndex({ item, queue }: PlayerState): number {
  return item ? queue.findIndex((q) => q.trackId === item.trackId) : -1;
}

/** The remembered volume, or the defaults if there's none (or it's unreadable). */
function recall(memory: VolumeMemory | undefined): Pick<PlayerState, 'volume' | 'muted'> {
  try {
    const saved: unknown = JSON.parse(memory?.load() ?? 'null');
    if (saved && typeof saved === 'object' && 'volume' in saved && 'muted' in saved) {
      const { volume, muted } = saved;
      if (typeof volume === 'number' && volume >= 0 && volume <= 1 && typeof muted === 'boolean')
        return { volume, muted };
    }
  } catch {
    // Unreadable: start from the defaults.
  }
  return { volume: initialPlayerState.volume, muted: initialPlayerState.muted };
}

/**
 * The app's one audio player (docs/frontend.md): owns a single audio element, so only one
 * track ever plays. Stream URLs are short-lived, so it fetches a new one when the current one
 * has expired before a resume, or when playback fails (a later range request with an expired
 * URL), and carries on from the same position. Fresh URLs are kept per version, so switching
 * between versions (A/B) or prefetching the next one skips a round trip. A queue plays tracks in
 * order, moving on by itself when one ends and stopping after the last.
 */
export function createAudioStore({
  createAudio,
  fetchStream,
  now,
  memory,
  fetchWaveform,
}: AudioStoreDeps) {
  let state: PlayerState = { ...initialPlayerState, ...recall(memory) };
  const listeners = new Set<() => void>();
  let audio: AudioLike | null = null;
  let expiresAt = 0;
  /** The last stream URL fetched for each version, reused while it's fresh. */
  const urls = new Map<string, StreamUrl>();
  /** Where to start once the next source has loaded its metadata. */
  let pendingSeekMs: number | null = null;
  /** Bumped by every new source, so an older fetch that finishes late is ignored. */
  let loadId = 0;
  /** Set after one URL refresh for a playback error, cleared once playback works again. */
  let retried = false;
  /** When the next track's stream URL was last fetched ahead of time. */
  let preparedAt = 0;
  /** Waveforms fetched for items that came without one, by version. */
  const waveforms = new Map<string, WaveformData>();
  /** Versions whose waveform is being fetched. */
  const fetchingWaveform = new Set<string>();

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
    el.volume = state.volume;
    el.muted = state.muted;
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
      if (pendingSeekMs !== null) return;
      set({ positionMs: Math.round(el.currentTime * 1000) });
      prepareNext();
    });
    el.addEventListener('ended', () => {
      const next = state.queue[queueIndex(state) + 1];
      if (next && queueIndex(state) >= 0) void start(next);
      else set({ status: 'paused', positionMs: state.item?.durationMs ?? state.positionMs });
    });
    el.addEventListener('error', () => {
      if (!state.item) return;
      if (retried) {
        set({ status: 'error', error: playbackError() });
        return;
      }
      retried = true;
      void loadSource(state.item, state.status !== 'paused', { fresh: true });
    });
    audio = el;
    return el;
  }

  function isFresh(url: StreamUrl) {
    return now() < Date.parse(url.expiresAt) - EXPIRY_MARGIN_MS;
  }

  /** A stream URL for the version: the kept one while it's fresh (unless `fresh`), else a new one. */
  async function streamUrl(item: PlayerItem, fresh: boolean): Promise<StreamUrl | null> {
    const kept = urls.get(item.versionId);
    if (kept && !fresh && isFresh(kept)) return kept;
    const result = await fetchStream(item.versionId, item.shareToken).catch(() => null);
    if (!result?.ok) return null;
    urls.set(item.versionId, result.data);
    return result.data;
  }

  /**
   * Points the element at a stream URL for the version, starting from `positionMs`. Seeks made
   * while it loads move that start rather than the old source. `fresh` skips the kept URL, for
   * when it may be the reason playback failed.
   */
  async function loadSource(item: PlayerItem, autoplay: boolean, { fresh = false } = {}) {
    const id = ++loadId;
    const el = element();
    pendingSeekMs = state.positionMs;
    if (autoplay) set({ status: 'loading', error: null });
    const url = await streamUrl(item, fresh);
    if (id !== loadId) return;
    if (!url) {
      pendingSeekMs = null;
      set({ status: 'error', error: playbackError() });
      return;
    }
    expiresAt = Date.parse(url.expiresAt);
    el.src = url.url;
    if (autoplay) await startPlayback(el);
  }

  /** Near the end of a track, gets the next one's stream URL ready; see `PREPARE_NEXT_MS`. */
  function prepareNext() {
    const index = queueIndex(state);
    const next = index >= 0 ? state.queue[index + 1] : undefined;
    if (!next || !state.item || state.item.durationMs - state.positionMs > PREPARE_NEXT_MS) return;
    if (now() - preparedAt < PREPARE_RETRY_MS) return;
    const kept = urls.get(next.versionId);
    const needsUrl = !kept || !isFresh(kept);
    if (!needsUrl && !needsWaveform(next)) return;
    preparedAt = now();
    if (needsUrl) void streamUrl(next, false);
    fillWaveform(next);
  }

  function needsWaveform(item: PlayerItem) {
    return fetchWaveform !== undefined && item.peaks.length === 0 && !waveforms.has(item.versionId);
  }

  /** The item with its waveform, if it came without one and that's been fetched. */
  function withWaveform(item: PlayerItem): PlayerItem {
    const known = item.peaks.length === 0 ? waveforms.get(item.versionId) : undefined;
    return known ? { ...item, ...known } : item;
  }

  /**
   * Fetches the waveform of an item that came without one, then shows it wherever that version is
   * in the player. Never awaited: a failure leaves the waveform flat, and a later start tries again.
   */
  function fillWaveform(item: PlayerItem) {
    if (!fetchWaveform || !needsWaveform(item) || fetchingWaveform.has(item.versionId)) return;
    const { versionId } = item;
    fetchingWaveform.add(versionId);
    void fetchWaveform(item)
      .catch(() => null)
      .then((waveform) => {
        fetchingWaveform.delete(versionId);
        if (!waveform) return;
        waveforms.set(versionId, waveform);
        const loaded = state.item?.versionId === versionId;
        const queued = state.queue.some((q) => q.versionId === versionId);
        if (!loaded && !queued) return;
        set({
          ...(loaded && state.item && { item: withWaveform(state.item) }),
          ...(queued && { queue: state.queue.map(withWaveform) }),
        });
      });
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
    // Finished: start over, or a new source would pick up at its very end and finish at once.
    if (state.positionMs >= item.durationMs) seek(0);
    if (state.status === 'error' || now() >= expiresAt - EXPIRY_MARGIN_MS) {
      await loadSource(item, true, { fresh: state.status === 'error' });
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

  /** Loads and plays `item`, leaving the queue as it is. */
  async function start(given: PlayerItem, atMs?: number) {
    const item = withWaveform(given);
    fillWaveform(item);
    if (state.item?.versionId === item.versionId && state.status !== 'error') {
      if (atMs !== undefined) seek(atMs);
      await resume();
      return;
    }
    audio?.pause();
    retried = false;
    expiresAt = 0;
    set({ item, status: 'loading', positionMs: atMs ?? 0, error: null });
    await loadSource(item, true);
  }

  /**
   * Plays `item` (from `atMs` if given), switching from whatever was playing. A track that isn't
   * in the queue replaces it: the listener has left that running order.
   */
  async function play(item: PlayerItem, atMs?: number) {
    if (!state.queue.some((q) => q.trackId === item.trackId)) set({ queue: [], queueId: null });
    await start(item, atMs);
  }

  /**
   * Plays `items` in order from `index`. If that track is already loaded it carries on from where
   * it is, in whichever version is loaded.
   */
  async function playQueue(queueId: string, items: readonly PlayerItem[], index: number) {
    const item = items[index];
    if (!item) return;
    const loaded = state.item?.trackId === item.trackId;
    preparedAt = 0;
    set({ queue: items.map(withWaveform), queueId });
    if (loaded) await resume();
    else await start(item);
  }

  /**
   * Keeps the queue current when its source changes (tracks reordered, added, or removed), without
   * touching playback, and only if that source's queue is the one in the player. A track that's
   * playing stays in the queue even if it was removed, so "next" still goes to what followed it.
   */
  function syncQueue(queueId: string, items: readonly PlayerItem[]) {
    if (state.queueId !== queueId) return;
    const index = queueIndex(state);
    const playing = state.queue[index];
    const kept =
      playing && !items.some((q) => q.trackId === playing.trackId)
        ? items.toSpliced(index, 0, playing)
        : items;
    set({ queue: kept.map(withWaveform) });
  }

  /** Moves on to the next track, if there is one, and plays it. */
  async function next() {
    const index = queueIndex(state);
    const item = index >= 0 ? state.queue[index + 1] : undefined;
    if (item) await start(item);
  }

  /** Back to the start of this track if it's under way, otherwise to the track before. */
  async function previous() {
    const index = queueIndex(state);
    const item = index > 0 ? state.queue[index - 1] : undefined;
    if (item && state.positionMs <= RESTART_AFTER_MS) await start(item);
    else seek(0);
  }

  /**
   * Swaps the loaded version for another (A/B compare): carries on from the same moment, capped
   * at the new version's length, and keeps playing or stays paused as before.
   */
  async function switchTo(item: PlayerItem) {
    if (!state.item || state.item.versionId === item.versionId) return;
    const playing = state.status === 'playing' || state.status === 'loading';
    audio?.pause();
    retried = false;
    expiresAt = 0;
    set({
      item,
      status: playing ? 'loading' : 'paused',
      positionMs: Math.min(state.positionMs, item.durationMs),
      error: null,
    });
    await loadSource(item, playing);
  }

  /** Shows a track's new name if it's the one loaded, without touching playback. */
  function retitle(trackId: string, title: string) {
    set({
      ...(state.item?.trackId === trackId && { item: { ...state.item, title } }),
      queue: state.queue.map((q) => (q.trackId === trackId ? { ...q, title } : q)),
    });
  }

  /** Fetches a version's stream URL ahead of time, so playing or switching to it starts sooner. */
  async function prefetch(item: PlayerItem) {
    await streamUrl(item, false);
  }

  /** Applies and remembers a volume change. */
  function setSound(patch: Pick<PlayerState, 'volume' | 'muted'>) {
    if (audio) {
      audio.volume = patch.volume;
      audio.muted = patch.muted;
    }
    set(patch);
    try {
      memory?.save(JSON.stringify(patch));
    } catch {
      // Storage full or blocked: the level still applies, it just isn't remembered.
    }
  }

  /** Sets the volume (0 to 1). Turning it up unmutes, like a hardware fader. */
  function setVolume(volume: number) {
    const clamped = Math.min(1, Math.max(0, volume));
    setSound({ volume: clamped, muted: state.muted && clamped === 0 });
  }

  /** Mutes or unmutes. Unmuting at zero volume goes to half, so it's never silent unmuted. */
  function toggleMute() {
    if (state.muted || state.volume === 0) {
      setSound({ volume: state.volume === 0 ? 0.5 : state.volume, muted: false });
    } else {
      setSound({ volume: state.volume, muted: true });
    }
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
    playQueue,
    syncQueue,
    next,
    previous,
    switchTo,
    retitle,
    prefetch,
    resume,
    pause,
    toggle,
    seek,
    setVolume,
    toggleMute,
  };
}

export type AudioStore = ReturnType<typeof createAudioStore>;
