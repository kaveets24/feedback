// Helpers for the worker's tests. Audio fixtures are generated with ffmpeg when tests run, so no
// binary files are committed.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { pino } from 'pino';
import {
  createTrackWithFirstVersion,
  markVersionProcessing,
  upsertUserFromAuth,
  type Db,
} from '@feedback/db';
import type { Storage } from '@feedback/storage';

const exec = promisify(execFile);

export const silentLog = pino({ level: 'silent' });

/** A 440 Hz tone at ffmpeg's default sine amplitude (1/8 of full scale). */
export const TONE_LEVEL = 0.125;
const tone = (seconds: number, rate = 44_100) => [
  ...['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}:sample_rate=${rate}`],
];

/** ffmpeg arguments for each fixture, all 3 seconds of tone unless noted. */
export const FIXTURES = {
  'tone.wav': [...tone(3), '-ac', '2'],
  'tone.mp3': [...tone(3), '-c:a', 'libmp3lame'],
  'tone.flac': tone(3),
  'tone.ogg': [...tone(3, 48_000), '-c:a', 'libopus'],
  'tone.aac': [...tone(3), '-c:a', 'aac', '-f', 'adts'],
  // A 96 kHz recording, tagged, with cover art (which ffmpeg sees as a video stream).
  'tagged.m4a': [
    ...tone(3, 96_000),
    ...['-f', 'lavfi', '-i', 'color=red:size=64x64:duration=1', '-map', '0', '-map', '1'],
    ...['-c:a', 'aac', '-c:v', 'png', '-disposition:v', 'attached_pic'],
    ...['-metadata', 'title=Secret demo title', '-f', 'mp4'],
  ],
  // Video only: sniffs as m4a, but there's no audio in it.
  'video.mp4': [
    ...['-f', 'lavfi', '-i', 'color=red:size=64x64:duration=1', '-c:v', 'mpeg4', '-f', 'mp4'],
  ],
} as const;

export type FixtureName = keyof typeof FIXTURES;

/** Writes a fixture into `dir` and returns its path. */
export async function makeFixture(dir: string, name: FixtureName): Promise<string> {
  const path = join(dir, name);
  await exec('ffmpeg', ['-v', 'error', '-y', ...FIXTURES[name], path]);
  return path;
}

/** Starts like a WAV (so it passes the API's sniffing) but is random bytes. */
export async function makeGarbage(dir: string): Promise<string> {
  const path = join(dir, 'garbage.wav');
  const noise = crypto.getRandomValues(new Uint8Array(50_000));
  await writeFile(path, Buffer.concat([Buffer.from('RIFF\0\0\0\0WAVE'), noise]));
  return path;
}

/** A 3-second FLAC whose header says it's 1 second long. */
export async function makeUnderstatedFlac(dir: string): Promise<string> {
  const path = await makeFixture(dir, 'tone.flac');
  const bytes = await readFile(path);
  // STREAMINFO's 36-bit total sample count: the low nibble of byte 21, then bytes 22 to 25.
  const total = 44_100;
  bytes[21] = bytes[21]! & 0xf0;
  bytes.writeUInt32BE(total, 22);
  await writeFile(path, bytes);
  return path;
}

export interface ProbedFile {
  streams: { codec_type: string; codec_name: string; sample_rate?: string; channels?: number }[];
  format: { format_name: string; duration: string; tags?: Record<string, string> };
}

/** What ffprobe sees in a file, for checking the worker's output. */
export async function probeFile(path: string): Promise<ProbedFile> {
  const { stdout } = await exec('ffprobe', [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  return JSON.parse(stdout) as ProbedFile;
}

/**
 * A track whose v1 is `processing` with `original` (a local file) uploaded, as the API leaves it
 * once an upload is confirmed. Pass no file to leave the original missing.
 */
export async function processingVersion(db: Db, storage: Storage, original?: string) {
  const owner = await upsertUserFromAuth(db, { authProviderId: 'auth_owner', email: 'o@x.test' });
  const { version } = await createTrackWithFirstVersion(db, {
    ownerId: owner.id,
    title: 'Late Night Idea',
    original: { filename: 'idea.wav', contentType: 'audio/wav', sizeBytes: 1 },
  });
  if (original) await storage.upload(version.originalKey, original, 'audio/wav');
  await markVersionProcessing(db, version.id);
  return version;
}
