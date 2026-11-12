import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from './action-result';
import {
  createAudioStore,
  EXPIRY_MARGIN_MS,
  PREPARE_NEXT_MS,
  queueIndex,
  RESTART_AFTER_MS,
  type AudioLike,
  type PlayerItem,
  type StreamUrl,
  type WaveformData,
} from './audio-store';

/** Stands in for an HTMLAudioElement: tests fire its media events by hand. */
class FakeAudio extends EventTarget {
  src = '';
  volume = 1;
  muted = false;
  currentTime = 0;
  paused = true;
  playCalls = 0;
  play = vi.fn(async () => {
    this.playCalls++;
    this.paused = false;
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.fire('pause');
  });
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

const item = (n: number): PlayerItem => ({
  versionId: `version-${n}`,
  trackId: `track-${n}`,
  title: `Song ${n}`,
  versionNumber: 1,
  durationMs: 180_000,
  peaks: [0.5],
});

const T0 = Date.parse('2026-10-19T12:00:00Z');
const MINUTES_10 = 10 * 60_000;

function setup({
  saved,
  fetchWaveform,
}: {
  saved?: string | null;
  fetchWaveform?: (item: PlayerItem) => Promise<WaveformData | null>;
} = {}) {
  const audio = new FakeAudio();
  const memory = {
    value: saved ?? null,
    load: () => memory.value,
    save: (v: string) => (memory.value = v),
  };
  let clock = T0;
  let urls = 0;
  const fetchStream = vi.fn(async (versionId: string): Promise<ActionResult<StreamUrl>> => ({
    ok: true,
    data: {
      url: `https://storage.test/${versionId}?sig=${++urls}`,
      expiresAt: new Date(clock + MINUTES_10).toISOString(),
    },
  }));
  const store = createAudioStore({
    createAudio: () => audio as unknown as AudioLike,
    fetchStream,
    now: () => clock,
    memory,
    fetchWaveform,
  });
  return {
    audio,
    memory,
    store,
    fetchStream,
    advance: (ms: number) => (clock += ms),
    /** The element has loaded the new source and started playing. */
    started: () => {
      audio.fire('loadedmetadata');
      audio.fire('playing');
    },
  };
}

describe('audio store', () => {
  it('starts idle with nothing loaded', () => {
    const { store } = setup();
    expect(store.getState()).toEqual({
      item: null,
      status: 'idle',
      positionMs: 0,
      error: null,
      volume: 1,
      muted: false,
      queue: [],
      queueId: null,
    });
  });

  it('fetches a stream URL and plays it', async () => {
    const { store, audio, fetchStream, started } = setup();
    const playing = store.play(item(1));
    expect(store.getState()).toMatchObject({ item: item(1), status: 'loading' });
    await playing;
    expect(fetchStream).toHaveBeenCalledWith('version-1', undefined);
    expect(audio.src).toBe('https://storage.test/version-1?sig=1');
    expect(audio.play).toHaveBeenCalledOnce();
    started();
    expect(store.getState().status).toBe('playing');
  });

  it('fetches the stream with the share link an item was opened with', async () => {
    const { store, fetchStream } = setup();
    await store.play({ ...item(1), shareToken: 'shared-token' });
    expect(fetchStream).toHaveBeenCalledWith('version-1', 'shared-token');
  });

  it('starts from a given position once the source has loaded', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1), 42_000);
    expect(store.getState().positionMs).toBe(42_000);
    started();
    expect(audio.currentTime).toBe(42);
  });

  it('tracks the position as it plays', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    audio.currentTime = 12.3456;
    audio.fire('timeupdate');
    expect(store.getState().positionMs).toBe(12_346);
  });

  it('pauses and resumes without fetching a new URL while the old one is fresh', async () => {
    const { store, audio, fetchStream, started } = setup();
    await store.play(item(1));
    started();
    await store.toggle();
    expect(audio.pause).toHaveBeenCalled();
    expect(store.getState().status).toBe('paused');
    await store.toggle();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(fetchStream).toHaveBeenCalledOnce();
  });

  it('fetches a new URL to resume once the old one is about to expire', async () => {
    const { store, audio, fetchStream, advance, started } = setup();
    await store.play(item(1));
    started();
    audio.currentTime = 95;
    audio.fire('timeupdate');
    store.pause();
    advance(MINUTES_10 - EXPIRY_MARGIN_MS);
    await store.resume();
    expect(fetchStream).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://storage.test/version-1?sig=2');
    started();
    expect(audio.currentTime).toBe(95);
  });

  it('recovers from a playback error by fetching a new URL and carrying on', async () => {
    const { store, audio, fetchStream, started } = setup();
    await store.play(item(1));
    started();
    audio.currentTime = 30;
    audio.fire('timeupdate');
    audio.fire('error');
    await vi.waitFor(() => expect(audio.src).toBe('https://storage.test/version-1?sig=2'));
    expect(fetchStream).toHaveBeenCalledTimes(2);
    started();
    expect(audio.currentTime).toBe(30);
    expect(store.getState()).toMatchObject({ status: 'playing', error: null });
  });

  it('shows an error when playback fails again after a refresh', async () => {
    const { store, audio, fetchStream } = setup();
    await store.play(item(1));
    audio.fire('error');
    await vi.waitFor(() => expect(fetchStream).toHaveBeenCalledTimes(2));
    audio.fire('error');
    expect(store.getState()).toMatchObject({
      status: 'error',
      error: 'Couldn’t play v1. Press play to try again.',
    });
    expect(fetchStream).toHaveBeenCalledTimes(2);
  });

  it('shows an error when there’s no URL to be had, and retries on the next play', async () => {
    const { store, audio, fetchStream } = setup();
    fetchStream.mockResolvedValueOnce({ ok: false, message: 'Not found.' });
    await store.play(item(1));
    expect(store.getState()).toMatchObject({
      status: 'error',
      error: 'Couldn’t play v1. Press play to try again.',
    });
    await store.toggle();
    expect(fetchStream).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe('https://storage.test/version-1?sig=1');
    expect(store.getState()).toMatchObject({ status: 'loading', error: null });
  });

  it('switches tracks: only one plays at a time', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    await store.play(item(2));
    expect(audio.pause).toHaveBeenCalled();
    expect(audio.src).toBe('https://storage.test/version-2?sig=2');
    expect(store.getState().item).toEqual(item(2));
  });

  it('ignores a slow URL fetch for a track that was switched away from', async () => {
    const { store, audio, fetchStream } = setup();
    let release!: () => void;
    fetchStream.mockImplementationOnce(
      (versionId) =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              ok: true,
              data: {
                url: `https://storage.test/${versionId}?slow`,
                expiresAt: '2099-01-01T00:00:00Z',
              },
            });
        }),
    );
    const first = store.play(item(1));
    await store.play(item(2));
    release();
    await first;
    expect(audio.src).toBe('https://storage.test/version-2?sig=1');
    expect(store.getState().item?.versionId).toBe('version-2');
  });

  it('does not start playing when paused while the URL loads', async () => {
    const { store, audio } = setup();
    const playing = store.play(item(1));
    store.pause();
    await playing;
    expect(audio.play).not.toHaveBeenCalled();
    expect(store.getState().status).toBe('paused');
  });

  it('clamps seeks to the track and moves the element', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    store.seek(-5);
    expect(store.getState().positionMs).toBe(0);
    store.seek(999_999);
    expect(store.getState().positionMs).toBe(180_000);
    store.seek(61_000);
    expect(audio.currentTime).toBe(61);
  });

  it('applies a seek made while loading once the source is ready', async () => {
    const { store, audio, started } = setup();
    const playing = store.play(item(1));
    store.seek(20_000);
    await playing;
    started();
    expect(audio.currentTime).toBe(20);
  });

  it('notifies subscribers on change and stops after unsubscribing', async () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.play(item(1));
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    store.seek(1000);
    expect(listener).not.toHaveBeenCalled();
  });

  describe('switching versions (A/B)', () => {
    const version = (n: number, durationMs = 180_000): PlayerItem => ({
      ...item(1),
      versionId: `version-1-${n}`,
      versionNumber: n,
      durationMs,
    });

    it('carries on playing from the same moment', async () => {
      const { store, audio, started } = setup();
      await store.play(version(1));
      started();
      audio.currentTime = 83.2;
      audio.fire('timeupdate');
      const switching = store.switchTo(version(2));
      expect(store.getState()).toMatchObject({ item: version(2), status: 'loading' });
      await switching;
      expect(audio.src).toBe('https://storage.test/version-1-2?sig=2');
      expect(audio.play).toHaveBeenCalledTimes(2);
      started();
      expect(audio.currentTime).toBe(83.2);
      expect(store.getState()).toMatchObject({ status: 'playing', positionMs: 83_200 });
    });

    it('stays paused when switched while paused', async () => {
      const { store, audio, started } = setup();
      await store.play(version(1));
      started();
      audio.currentTime = 40;
      audio.fire('timeupdate');
      store.pause();
      await store.switchTo(version(2));
      expect(audio.play).toHaveBeenCalledOnce();
      expect(audio.src).toBe('https://storage.test/version-1-2?sig=2');
      expect(store.getState()).toMatchObject({ status: 'paused', positionMs: 40_000 });
      audio.fire('loadedmetadata');
      expect(audio.currentTime).toBe(40);
    });

    it('caps the position at a shorter version’s length', async () => {
      const { store, audio, started } = setup();
      await store.play(version(1));
      started();
      audio.currentTime = 170;
      audio.fire('timeupdate');
      await store.switchTo(version(2, 150_000));
      expect(store.getState().positionMs).toBe(150_000);
    });

    it('reuses a fresh URL when switching back, so it skips a round trip', async () => {
      const { store, audio, fetchStream, started } = setup();
      await store.play(version(1));
      started();
      await store.switchTo(version(2));
      started();
      await store.switchTo(version(1));
      expect(fetchStream).toHaveBeenCalledTimes(2);
      expect(audio.src).toBe('https://storage.test/version-1-1?sig=1');
    });

    it('fetches a new URL when the kept one is about to expire', async () => {
      const { store, audio, fetchStream, advance, started } = setup();
      await store.play(version(1));
      started();
      await store.switchTo(version(2));
      started();
      advance(MINUTES_10 - EXPIRY_MARGIN_MS);
      await store.switchTo(version(1));
      expect(fetchStream).toHaveBeenCalledTimes(3);
      expect(audio.src).toBe('https://storage.test/version-1-1?sig=3');
    });

    it('uses a prefetched URL', async () => {
      const { store, audio, fetchStream, started } = setup();
      await store.play(version(1));
      started();
      await store.prefetch(version(2));
      await store.switchTo(version(2));
      expect(fetchStream).toHaveBeenCalledTimes(2);
      expect(audio.src).toBe('https://storage.test/version-1-2?sig=2');
    });

    it('ignores the old version’s slow URL when switched while it loads', async () => {
      const { store, audio, fetchStream } = setup();
      let release!: () => void;
      fetchStream.mockImplementationOnce(
        (versionId) =>
          new Promise((resolve) => {
            release = () =>
              resolve({
                ok: true,
                data: {
                  url: `https://storage.test/${versionId}?slow`,
                  expiresAt: '2099-01-01T00:00:00Z',
                },
              });
          }),
      );
      const first = store.play(version(1));
      await store.switchTo(version(2));
      release();
      await first;
      expect(audio.src).toBe('https://storage.test/version-1-2?sig=1');
      expect(store.getState()).toMatchObject({ item: version(2), status: 'loading' });
    });

    it('fetches a fresh URL after a playback error rather than reusing the kept one', async () => {
      const { store, audio, fetchStream, started } = setup();
      await store.play(version(1));
      started();
      await store.switchTo(version(2));
      started();
      await store.switchTo(version(1));
      audio.fire('error');
      await vi.waitFor(() => expect(audio.src).toBe('https://storage.test/version-1-1?sig=3'));
      expect(fetchStream).toHaveBeenCalledTimes(3);
    });

    it('does nothing with nothing loaded, or when switched to the loaded version', async () => {
      const { store, fetchStream } = setup();
      await store.switchTo(version(2));
      expect(store.getState().item).toBeNull();
      await store.play(version(1));
      await store.switchTo(version(1));
      expect(fetchStream).toHaveBeenCalledOnce();
    });
  });

  it('stops at the end, at the full duration', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    audio.fire('ended');
    expect(store.getState()).toMatchObject({ status: 'paused', positionMs: 180_000 });
  });
});

describe('volume', () => {
  it('starts at full volume, unmuted, and applies the level to the element once it exists', async () => {
    const { store, audio, started } = setup();
    expect(store.getState()).toMatchObject({ volume: 1, muted: false });
    store.setVolume(0.4);
    await store.play(item(1));
    started();
    expect(audio.volume).toBe(0.4);
    expect(audio.muted).toBe(false);
  });

  it('remembers the level and mute between visits, and ignores anything unreadable', () => {
    const first = setup();
    first.store.setVolume(0.25);
    first.store.toggleMute();
    expect(JSON.parse(first.memory.value!)).toEqual({ volume: 0.25, muted: true });

    expect(setup({ saved: first.memory.value }).store.getState()).toMatchObject({
      volume: 0.25,
      muted: true,
    });
    for (const saved of ['not json', '{"volume":3,"muted":false}', '{"volume":0.5}']) {
      expect(setup({ saved }).store.getState()).toMatchObject({ volume: 1, muted: false });
    }
  });

  it('clamps the level, and turning it up unmutes', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    store.setVolume(2);
    expect(audio.volume).toBe(1);
    store.toggleMute();
    expect(audio.muted).toBe(true);
    store.setVolume(0.6);
    expect(store.getState()).toMatchObject({ volume: 0.6, muted: false });
    expect(audio.muted).toBe(false);
    store.setVolume(-1);
    expect(store.getState().volume).toBe(0);
  });

  it('shows a new name for the loaded track, and ignores any other', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();

    store.retitle('track-2', 'Not this one');
    expect(store.getState().item?.title).toBe('Song 1');

    store.retitle('track-1', 'Night drive');
    expect(store.getState()).toMatchObject({
      item: { versionId: 'version-1', title: 'Night drive' },
      status: 'playing',
    });
    expect(audio.play).toHaveBeenCalledOnce();
  });

  it('unmutes back to the level it had, or to half from zero', () => {
    const { store } = setup();
    store.setVolume(0.3);
    store.toggleMute();
    store.toggleMute();
    expect(store.getState()).toMatchObject({ volume: 0.3, muted: false });
    store.setVolume(0);
    store.toggleMute();
    expect(store.getState()).toMatchObject({ volume: 0.5, muted: false });
  });
});

describe('audio store queue', () => {
  const album = [item(1), item(2), item(3)];

  /** A store playing the album from `index`, with the source loaded and sound coming out. */
  async function playing(index = 0) {
    const context = setup();
    await context.store.playQueue('project', album, index);
    context.started();
    return context;
  }

  it('plays from the chosen track and says where it is', async () => {
    const { store } = await playing(1);
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(queueIndex(store.getState())).toBe(1);
  });

  it('moves on by itself when a track ends, and stops after the last', async () => {
    const { store, audio, started } = await playing(1);
    audio.fire('ended');
    await vi.waitFor(() => expect(audio.src).toContain('version-3'));
    expect(store.getState().status).toBe('loading');
    expect(store.getState().positionMs).toBe(0);
    started();

    audio.fire('ended');
    expect(store.getState().item?.versionId).toBe('version-3');
    expect(store.getState().status).toBe('paused');
    expect(store.getState().positionMs).toBe(180_000);
  });

  it('a lone track stops when it ends', async () => {
    const { store, audio, started } = setup();
    await store.play(item(1));
    started();
    audio.fire('ended');
    expect(store.getState().status).toBe('paused');
  });

  it('starts the album over from a finished last track', async () => {
    const { store, audio, started } = await playing(2);
    audio.fire('ended');
    await store.playQueue('project', album, 0);
    started();
    expect(store.getState().item?.versionId).toBe('version-1');
  });

  it('starts a finished track from the top, even when its URL has expired', async () => {
    const { store, audio, started, advance } = setup();
    await store.play(item(1));
    started();
    audio.fire('ended');
    advance(MINUTES_10);
    await store.resume();
    expect(store.getState().positionMs).toBe(0);
    audio.currentTime = 99;
    started();
    expect(audio.currentTime).toBe(0);
  });

  it('next plays the next track, and does nothing on the last', async () => {
    const { store, audio } = await playing(0);
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(audio.src).toContain('version-2');
    await store.next();
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-3');
  });

  it('next plays even from paused', async () => {
    const { store, audio } = await playing(0);
    store.pause();
    await store.next();
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(store.getState().status).toBe('loading');
  });

  it('previous goes back a track near the start, and restarts one that is under way', async () => {
    const { store, audio, started } = await playing(1);
    audio.currentTime = (RESTART_AFTER_MS + 1000) / 1000;
    audio.fire('timeupdate');
    await store.previous();
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(audio.currentTime).toBe(0);

    audio.fire('timeupdate');
    await store.previous();
    expect(store.getState().item?.versionId).toBe('version-1');
    started();

    // The first track has nothing before it, so it stays put.
    await store.previous();
    expect(store.getState().item?.versionId).toBe('version-1');
    expect(store.getState().positionMs).toBe(0);
  });

  it('a failed stream URL stops the album with an error rather than skipping on', async () => {
    const { store, audio, fetchStream } = await playing(0);
    fetchStream.mockResolvedValueOnce({ ok: false, message: 'Not found' });
    audio.fire('ended');
    await vi.waitFor(() => expect(store.getState().status).toBe('error'));
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(store.getState().error).toContain('Press play');
    // Next still works from the error.
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-3');
  });

  it('a track outside the queue clears it; one inside keeps it', async () => {
    const { store } = await playing(0);
    await store.play(item(2));
    expect(store.getState().queueId).toBe('project');
    expect(queueIndex(store.getState())).toBe(1);

    await store.play(item(9));
    expect(store.getState().queue).toEqual([]);
    expect(store.getState().queueId).toBeNull();
    expect(queueIndex(store.getState())).toBe(-1);
  });

  it('keeps its place while comparing an older version, and next moves on from it', async () => {
    const { store } = await playing(0);
    await store.switchTo({ ...item(1), versionId: 'older', versionNumber: 0 });
    expect(queueIndex(store.getState())).toBe(0);
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-2');
  });

  it('pressing a track that is loaded in an older version carries on with that version', async () => {
    const { store } = await playing(0);
    await store.switchTo({ ...item(1), versionId: 'older', versionNumber: 0 });
    store.pause();
    await store.playQueue('project', album, 0);
    expect(store.getState().item?.versionId).toBe('older');
  });

  it('syncs a reorder without touching playback, and only for its own queue', async () => {
    const { store, audio } = await playing(0);
    const plays = audio.play.mock.calls.length;
    store.syncQueue('other', [item(7)]);
    expect(store.getState().queue).toEqual(album);

    const reordered = [item(2), item(1), item(3)];
    store.syncQueue('project', reordered);
    expect(queueIndex(store.getState())).toBe(1);
    expect(audio.play.mock.calls.length).toBe(plays);
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-3');
  });

  it('keeps the playing track in place when it is removed, so next goes to what followed', async () => {
    const { store } = await playing(1);
    store.syncQueue('project', [item(1), item(3)]);
    expect(store.getState().queue.map((q) => q.trackId)).toEqual(['track-1', 'track-2', 'track-3']);
    await store.next();
    expect(store.getState().item?.versionId).toBe('version-3');
  });

  it('retitles the track in the queue too', async () => {
    const { store } = await playing(0);
    store.retitle('track-3', 'New name');
    expect(store.getState().item?.title).toBe('Song 1');
    expect(store.getState().queue[2]?.title).toBe('New name');
  });

  it('fetches the next stream URL near the end of a track, once, and uses it', async () => {
    const { store, audio, fetchStream, started } = await playing(0);
    const seen = () => fetchStream.mock.calls.filter(([id]) => id === 'version-2').length;

    audio.currentTime = (180_000 - PREPARE_NEXT_MS - 1000) / 1000;
    audio.fire('timeupdate');
    expect(seen()).toBe(0);

    audio.currentTime = (180_000 - PREPARE_NEXT_MS + 1000) / 1000;
    audio.fire('timeupdate');
    audio.fire('timeupdate');
    expect(seen()).toBe(1);
    // Let the fetch finish, as it has by the end of the track.
    await new Promise((resolve) => setTimeout(resolve));

    audio.fire('ended');
    await vi.waitFor(() => expect(audio.src).toContain('version-2'));
    started();
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(seen()).toBe(1);
  });

  it('fetches the next stream URL again if the kept one has gone stale', async () => {
    const { audio, fetchStream, advance } = await playing(0);
    const seen = () => fetchStream.mock.calls.filter(([id]) => id === 'version-2').length;
    audio.currentTime = 179;
    audio.fire('timeupdate');
    await vi.waitFor(() => expect(seen()).toBe(1));
    advance(MINUTES_10);
    audio.fire('timeupdate');
    await vi.waitFor(() => expect(seen()).toBe(2));
  });
});

describe('audio store waveforms for list items', () => {
  /** A row of a list, which comes without its peaks. */
  const row = (n: number): PlayerItem => ({ ...item(n), peaks: [], durationMs: 0 });
  const list = [row(1), row(2), row(3)];
  const waveform = (versionId: string): WaveformData => ({
    peaks: [Number(versionId.at(-1)) / 10],
    durationMs: 120_000,
  });

  /** A waveform fetch that finishes only when the test says. */
  function deferredWaveforms() {
    const pending = new Map<string, (w: WaveformData | null) => void>();
    const fetchWaveform = vi.fn(
      ({ versionId }: PlayerItem) =>
        new Promise<WaveformData | null>((resolve) => pending.set(versionId, resolve)),
    );
    const finish = async (versionId: string, w: WaveformData | null = waveform(versionId)) => {
      pending.get(versionId)?.(w);
      await new Promise((resolve) => setTimeout(resolve));
    };
    return { fetchWaveform, finish };
  }

  it('plays straight away and shows the waveform and length once they arrive', async () => {
    const { fetchWaveform, finish } = deferredWaveforms();
    const { store, audio, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 1);
    started();
    expect(audio.play).toHaveBeenCalled();
    expect(store.getState().item?.peaks).toEqual([]);

    await finish('version-2');
    expect(store.getState().item).toMatchObject({ peaks: [0.2], durationMs: 120_000 });
    expect(store.getState().queue[1]).toMatchObject({ peaks: [0.2], durationMs: 120_000 });
    expect(fetchWaveform).toHaveBeenCalledTimes(1);
  });

  it('does not fetch a waveform for an item that has one', async () => {
    const fetchWaveform = vi.fn(async () => null);
    const { store } = setup({ fetchWaveform });
    await store.playQueue('project', [item(1), item(2)], 0);
    expect(fetchWaveform).not.toHaveBeenCalled();
  });

  it('a late waveform for a track moved away from goes to its queue entry, not what plays', async () => {
    const { fetchWaveform, finish } = deferredWaveforms();
    const { store, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 0);
    started();
    await store.next();
    await finish('version-1');
    expect(store.getState().item?.versionId).toBe('version-2');
    expect(store.getState().item?.peaks).toEqual([]);
    expect(store.getState().queue[0]?.peaks).toEqual([0.1]);
  });

  it('keeps fetched waveforms, so going back to a track does not fetch it again', async () => {
    const { fetchWaveform, finish } = deferredWaveforms();
    const { store, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 0);
    started();
    await finish('version-1');
    await store.next();
    await store.previous();
    expect(store.getState().item?.peaks).toEqual([0.1]);
    expect(fetchWaveform.mock.calls.filter(([i]) => i.versionId === 'version-1')).toHaveLength(1);
  });

  it('keeps known waveforms when the list syncs', async () => {
    const { fetchWaveform, finish } = deferredWaveforms();
    const { store, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 0);
    started();
    await finish('version-1');
    store.syncQueue('home', [row(1), row(2), row(3)]);
    expect(store.getState().queue[0]?.peaks).toEqual([0.1]);
  });

  it('fetches the next track’s waveform near the end, so it has one when it starts', async () => {
    const fetchWaveform = vi.fn(async ({ versionId }: PlayerItem) => waveform(versionId));
    const { store, audio, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 0);
    started();
    await vi.waitFor(() => expect(store.getState().item?.durationMs).toBe(120_000));

    audio.currentTime = (120_000 - PREPARE_NEXT_MS + 1000) / 1000;
    audio.fire('timeupdate');
    audio.fire('timeupdate');
    await vi.waitFor(() => expect(store.getState().queue[1]?.peaks).toEqual([0.2]));

    audio.fire('ended');
    await vi.waitFor(() => expect(store.getState().item?.versionId).toBe('version-2'));
    expect(store.getState().item?.peaks).toEqual([0.2]);
    expect(fetchWaveform.mock.calls.filter(([i]) => i.versionId === 'version-2')).toHaveLength(1);
  });

  it('a failed waveform leaves playback alone, and the next start tries again', async () => {
    const fetchWaveform = vi.fn<(item: PlayerItem) => Promise<WaveformData | null>>(async () => {
      throw new Error('offline');
    });
    const { store, started } = setup({ fetchWaveform });
    await store.playQueue('home', list, 0);
    started();
    await new Promise((resolve) => setTimeout(resolve));
    expect(store.getState().status).toBe('playing');
    expect(store.getState().error).toBeNull();

    store.pause();
    await store.resume();
    await store.next();
    await store.previous();
    expect(fetchWaveform.mock.calls.filter(([i]) => i.versionId === 'version-1')).toHaveLength(2);
  });
});
