import { describe, expect, it, vi } from 'vitest';
import type { ActionResult } from './action-result';
import {
  createAudioStore,
  EXPIRY_MARGIN_MS,
  type AudioLike,
  type PlayerItem,
  type StreamUrl,
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

function setup({ saved }: { saved?: string | null } = {}) {
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
