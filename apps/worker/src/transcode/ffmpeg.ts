// Runs ffprobe and ffmpeg on an uploaded original. Originals are untrusted input, so ffmpeg may
// only read local files (no URLs, so a crafted playlist can't make it fetch anything) and only
// with the demuxers for the formats we accept (CLAUDE.md section 7).
import { spawn } from 'node:child_process';
import { z } from 'zod';
import { MAX_DURATION_MS, WAVEFORM_PEAK_COUNT } from '@feedback/shared';
import { PeakCollector } from './peaks.ts';

/** ffmpeg's demuxers for mp3, wav, m4a (`mov` reads the whole mp4 family), aac, flac, ogg. */
const DEMUXERS = ['wav', 'mp3', 'mov', 'aac', 'flac', 'ogg'] as const;
const INPUT_GUARDS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', DEMUXERS.join(',')];

/** The stream's AAC bitrate: plenty to judge a mix, about 5 MB for a 3.5-minute song. */
const STREAM_BITRATE = '192k';
/** Content type of the stream file the worker writes. */
export const STREAM_CONTENT_TYPE = 'audio/mp4';
/** Higher rates are resampled for the stream; AAC spends its bits better at 48 kHz. */
const MAX_STREAM_SAMPLE_RATE = 48_000;

/** Peaks are taken from a mono copy at this rate, in 10 ms windows. */
const PEAK_SAMPLE_RATE = 16_000;
const PEAK_WINDOW = PEAK_SAMPLE_RATE / 100;

const PROBE_TIMEOUT_MS = 30_000;
/** Far longer than a 20-minute file takes; a run past this is stuck on something odd. */
const TRANSCODE_TIMEOUT_MS = 10 * 60_000;
/** ffmpeg runs with `-v error`, so its stderr is short; keep the end of it for error messages. */
const STDERR_LIMIT = 2000;

// Shown to the artist on a failed version, so plain words and what to do next.
export const UNUSABLE_REASONS = {
  unreadable:
    "We couldn't read any audio in this file. Try exporting it again as mp3, wav, m4a, aac, flac, or ogg.",
  tooLong: `This recording is longer than ${MAX_DURATION_MS / 60_000} minutes, the current limit. Upload a shorter version.`,
  tooSlow: 'This file took too long to process. Try exporting it again and uploading the new file.',
} as const;

/** The file itself can't be used. Retrying won't help; the artist needs to upload another. */
export class UnusableAudioError extends Error {
  /** Shown to the artist. */
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'UnusableAudioError';
    this.reason = reason;
  }
}

export interface TranscodeResult {
  /** Counted from the decoded samples, not read from the file's header, which can be wrong. */
  durationMs: number;
  peaks: number[];
}

export interface TranscodeOptions {
  maxDurationMs?: number;
  timeoutMs?: number;
}

/**
 * Turns the original at `input` into an AAC stream file at `output` and measures it, in one
 * decoding pass. Throws `UnusableAudioError` if the file is the problem, and a plain Error for
 * anything else (worth retrying).
 */
export async function transcode(
  input: string,
  output: string,
  { maxDurationMs = MAX_DURATION_MS, timeoutMs = TRANSCODE_TIMEOUT_MS }: TranscodeOptions = {},
): Promise<TranscodeResult> {
  const probed = await probe(input);
  if (probed.durationMs !== null && probed.durationMs > maxDurationMs) {
    throw new UnusableAudioError(UNUSABLE_REASONS.tooLong);
  }

  const peaks = new PeakCollector(PEAK_WINDOW);
  const maxSamples = (maxDurationMs / 1000) * PEAK_SAMPLE_RATE;
  let tooLong = false;
  const result = await run(
    'ffmpeg',
    [
      ...['-nostdin', '-v', 'error', ...INPUT_GUARDS, '-f', probed.demuxer, '-i', input],
      // Output 1: the stream file. Only the first audio stream, so cover art and any video are
      // dropped, and no metadata (tags can carry things the artist didn't mean to share).
      ...['-map', '0:a:0', '-map_metadata', '-1', '-c:a', 'aac', '-b:a', STREAM_BITRATE],
      ...['-ac', '2'],
      ...(probed.sampleRate > MAX_STREAM_SAMPLE_RATE
        ? ['-ar', String(MAX_STREAM_SAMPLE_RATE)]
        : []),
      ...['-movflags', '+faststart', '-f', 'mp4', '-y', output],
      // Output 2: mono float samples on stdout, for peaks and the exact duration.
      ...['-map', '0:a:0', '-ac', '1', '-ar', String(PEAK_SAMPLE_RATE), '-f', 'f32le', 'pipe:1'],
    ],
    {
      timeoutMs,
      onStdout(chunk, stop) {
        peaks.push(chunk);
        // The header claimed a shorter file than it is; stop rather than decode all of it.
        if (peaks.sampleCount > maxSamples) {
          tooLong = true;
          stop();
        }
      },
    },
  );

  if (tooLong) throw new UnusableAudioError(UNUSABLE_REASONS.tooLong);
  if (result.timedOut) throw new UnusableAudioError(UNUSABLE_REASONS.tooSlow);
  if (result.code !== 0) {
    throw new Error(`ffmpeg failed (${result.code ?? result.signal}): ${result.stderr}`);
  }
  if (peaks.sampleCount === 0) throw new UnusableAudioError(UNUSABLE_REASONS.unreadable);
  return {
    durationMs: Math.round((peaks.sampleCount / PEAK_SAMPLE_RATE) * 1000),
    peaks: peaks.peaks(WAVEFORM_PEAK_COUNT),
  };
}

const probeSchema = z.object({
  format: z.object({ format_name: z.string(), duration: z.coerce.number().optional() }),
  streams: z.array(z.object({ sample_rate: z.coerce.number().optional() })),
});

interface Probed {
  demuxer: (typeof DEMUXERS)[number];
  sampleRate: number;
  /** From the file's header, so only a hint. Null if the header doesn't say. */
  durationMs: number | null;
}

async function probe(input: string): Promise<Probed> {
  const result = await run(
    'ffprobe',
    [
      ...['-v', 'error', ...INPUT_GUARDS, '-select_streams', 'a:0'],
      ...['-show_entries', 'format=format_name,duration:stream=sample_rate', '-of', 'json', input],
    ],
    { timeoutMs: PROBE_TIMEOUT_MS },
  );
  if (result.timedOut) throw new UnusableAudioError(UNUSABLE_REASONS.tooSlow);
  // ffprobe exits non-zero when it can't make sense of the file (or its format isn't allowed).
  if (result.code !== 0) throw new UnusableAudioError(UNUSABLE_REASONS.unreadable);

  const parsed = probeSchema.parse(JSON.parse(result.stdout.toString('utf8')));
  // e.g. "mov,mp4,m4a,3gp,3g2,mj2": the first name is the demuxer.
  const demuxer = DEMUXERS.find((name) => name === parsed.format.format_name.split(',')[0]);
  const stream = parsed.streams[0];
  if (!demuxer || !stream) throw new UnusableAudioError(UNUSABLE_REASONS.unreadable);
  const { duration } = parsed.format;
  return {
    demuxer,
    sampleRate: stream.sample_rate ?? 0,
    durationMs: duration !== undefined && Number.isFinite(duration) ? duration * 1000 : null,
  };
}

interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

interface RunOptions {
  timeoutMs: number;
  /** Receives stdout as it arrives instead of collecting it. `stop` kills the process. */
  onStdout?: (chunk: Buffer, stop: () => void) => void;
}

function run(command: string, args: string[], { timeoutMs, onStdout }: RunOptions) {
  return new Promise<RunResult>((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stop = () => child.kill('SIGKILL');
    const stdout: Buffer[] = [];
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      if (onStdout) onStdout(chunk, stop);
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_LIMIT);
    });
    // e.g. ENOENT when ffmpeg isn't installed.
    child.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout: Buffer.concat(stdout), stderr: stderr.trim(), timedOut });
    });
  });
}
