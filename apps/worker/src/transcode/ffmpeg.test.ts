import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WAVEFORM_PEAK_COUNT } from '@feedback/shared';
import {
  makeFixture,
  makeGarbage,
  makeUnderstatedFlac,
  probeFile,
  TONE_LEVEL,
  type FixtureName,
} from '../testing.ts';
import { transcode, UNUSABLE_REASONS, UnusableAudioError } from './ffmpeg.ts';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ffmpeg-test-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

const output = (name: string) => join(dir, `${name}.out.m4a`);

async function unusable(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UnusableAudioError);
  return (err as UnusableAudioError).reason;
}

describe('transcode', () => {
  it.each<FixtureName>(['tone.wav', 'tone.mp3', 'tone.flac', 'tone.ogg', 'tone.aac', 'tagged.m4a'])(
    'turns %s into an AAC stream with its duration and peaks',
    async (name) => {
      const input = await makeFixture(dir, name);
      const result = await transcode(input, output(name));

      // Lossy formats pad a few milliseconds at the edges.
      expect(Math.abs(result.durationMs - 3000)).toBeLessThan(60);
      expect(result.peaks).toHaveLength(WAVEFORM_PEAK_COUNT);
      expect(result.peaks.every((p) => p >= 0 && p <= 1)).toBe(true);
      // Absolute levels: an eighth-scale tone peaks near 0.125, not 1.
      const loudest = Math.max(...result.peaks);
      expect(loudest).toBeGreaterThan(TONE_LEVEL * 0.8);
      expect(loudest).toBeLessThan(TONE_LEVEL * 1.25);

      const stream = await probeFile(output(name));
      expect(stream.streams.map((s) => [s.codec_type, s.codec_name])).toEqual([['audio', 'aac']]);
      expect(stream.streams[0]?.channels).toBe(2);
      expect(stream.format.format_name).toContain('mp4');
    },
  );

  it('drops cover art and tags, and resamples above 48 kHz', async () => {
    const input = await makeFixture(dir, 'tagged.m4a');
    expect((await probeFile(input)).format.tags?.title).toBe('Secret demo title');

    await transcode(input, output('tagged'));
    const stream = await probeFile(output('tagged'));
    expect(stream.streams).toHaveLength(1);
    expect(stream.streams[0]?.sample_rate).toBe('48000');
    expect(stream.format.tags?.title).toBeUndefined();
  });

  it('keeps sample rates up to 48 kHz', async () => {
    const input = await makeFixture(dir, 'tone.wav');
    await transcode(input, output('rate'));
    expect((await probeFile(output('rate'))).streams[0]?.sample_rate).toBe('44100');
  });

  it('rejects a file that only looks like audio', async () => {
    const input = await makeGarbage(dir);
    expect(await unusable(transcode(input, output('garbage')))).toBe(UNUSABLE_REASONS.unreadable);
  });

  it('rejects a file with no audio in it', async () => {
    const input = await makeFixture(dir, 'video.mp4');
    expect(await unusable(transcode(input, output('video')))).toBe(UNUSABLE_REASONS.unreadable);
  });

  it('rejects a format we do not accept, even with an allowed name', async () => {
    const input = join(dir, 'playlist.wav');
    await writeFile(input, '#EXTM3U\n#EXTINF:1,\nhttp://169.254.169.254/latest\n');
    expect(await unusable(transcode(input, output('playlist')))).toBe(UNUSABLE_REASONS.unreadable);
  });

  it('rejects a file whose header says it is over the limit', async () => {
    const input = await makeFixture(dir, 'tone.wav');
    const reason = await unusable(transcode(input, output('long'), { maxDurationMs: 2000 }));
    expect(reason).toBe(UNUSABLE_REASONS.tooLong);
  });

  it('stops decoding a file that is longer than its header says', async () => {
    const input = await makeUnderstatedFlac(dir);
    const reason = await unusable(transcode(input, output('liar'), { maxDurationMs: 2000 }));
    expect(reason).toBe(UNUSABLE_REASONS.tooLong);
  });

  it('gives up on a run that takes too long', async () => {
    const input = await makeFixture(dir, 'tone.wav');
    const reason = await unusable(transcode(input, output('slow'), { timeoutMs: 1 }));
    expect(reason).toBe(UNUSABLE_REASONS.tooSlow);
  });

  it('throws a plain (retryable) error when ffmpeg fails for another reason', async () => {
    const input = await makeFixture(dir, 'tone.wav');
    const err = await transcode(input, join(dir, 'missing-dir', 'out.m4a')).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnusableAudioError);
  });
});
