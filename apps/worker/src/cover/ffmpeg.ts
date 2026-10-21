// Re-encodes an uploaded image (cover art or a profile picture) with ffprobe and ffmpeg. Like
// audio originals, uploaded images are untrusted input: ffmpeg may only read local files, with only the demuxers for the image
// types we accept (CLAUDE.md section 7), and every bit of metadata is dropped, since a photo's
// EXIF can carry GPS location and the camera's details.
import { z } from 'zod';
import { COVER_MAX_SIZE } from '@feedback/shared';
import { run } from '../process.ts';

/** ffmpeg's demuxers for JPEG, PNG, and WebP, which tell the format from the bytes. */
const DEMUXERS = ['jpeg_pipe', 'png_pipe', 'webp_pipe'] as const;
const INPUT_GUARDS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', DEMUXERS.join(',')];

/** Content type of the image the worker writes. */
export const COVER_CONTENT_TYPE = 'image/jpeg';

/**
 * Larger images are refused before decoding: a small file can declare enormous dimensions
 * (a decompression bomb), and 50 megapixels is well past any phone camera.
 */
const MAX_PIXELS = 50_000_000;
const TIMEOUT_MS = 60_000;

// Shown to whoever uploaded a failed image, so plain words and what to do next.
export const UNUSABLE_IMAGE_REASONS = {
  unreadable: "We couldn't read this image. Try saving it again as a JPEG, PNG, or WebP.",
  tooLarge: 'This image is too large (over 50 megapixels). Try a smaller copy.',
  tooSlow: 'This image took too long to process. Try saving it again as a JPEG.',
} as const;

/** The image itself can't be used. Retrying won't help; they need another one. */
export class UnusableImageError extends Error {
  /** Shown to whoever uploaded it. */
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = 'UnusableImageError';
    this.reason = reason;
  }
}

/**
 * Turns the image at `input` into the square JPEG at `output`: rotated upright (ffmpeg applies
 * EXIF orientation itself), centre-cropped to a square, scaled down to at most `maxSize` a side
 * (never up, apart from rounding to an even size of at least 2), and written with no metadata.
 * Throws `UnusableImageError` if the image is the problem, and a plain Error for anything else
 * (worth retrying).
 */
export async function encodeCover(
  input: string,
  output: string,
  maxSize: number = COVER_MAX_SIZE,
): Promise<void> {
  const demuxer = await probe(input);
  const square = `crop='min(iw,ih)':'min(iw,ih)'`;
  // After the crop width and height are equal; both get the same even size (rounded down, at
  // least 2). Even, because ffmpeg versions disagree on odd sizes for 4:2:0 JPEG (some round
  // them, some keep them), and the output should be the same wherever the worker runs.
  const side = `max(2,trunc(min(${maxSize},iw)/2)*2)`;
  const scale = `scale='${side}':'${side}':flags=lanczos`;
  const result = await run(
    'ffmpeg',
    [
      ...['-nostdin', '-v', 'error', ...INPUT_GUARDS, '-f', demuxer, '-i', input],
      // One frame of the first image only, with no metadata and no other streams.
      ...['-map', '0:v:0', '-frames:v', '1', '-map_metadata', '-1'],
      // yuvj420p drops any transparency, which a JPEG can't hold.
      ...['-vf', `${square},${scale},format=yuvj420p`],
      ...['-c:v', 'mjpeg', '-q:v', '3', '-f', 'image2', '-y', output],
    ],
    { timeoutMs: TIMEOUT_MS },
  );
  if (result.timedOut) throw new UnusableImageError(UNUSABLE_IMAGE_REASONS.tooSlow);
  if (result.code !== 0) {
    throw new Error(`ffmpeg failed (${result.code ?? result.signal}): ${result.stderr}`);
  }
}

const probeSchema = z.object({
  format: z.object({ format_name: z.string() }),
  streams: z.array(z.object({ width: z.number().int(), height: z.number().int() })),
});

/** The image's demuxer, after checking it has a picture of an acceptable size. */
async function probe(input: string): Promise<(typeof DEMUXERS)[number]> {
  const result = await run(
    'ffprobe',
    [
      ...['-v', 'error', ...INPUT_GUARDS, '-select_streams', 'v:0'],
      ...['-show_entries', 'format=format_name:stream=width,height', '-of', 'json', input],
    ],
    { timeoutMs: TIMEOUT_MS },
  );
  if (result.timedOut) throw new UnusableImageError(UNUSABLE_IMAGE_REASONS.tooSlow);
  // ffprobe exits non-zero when it can't make sense of the file (or its format isn't allowed).
  if (result.code !== 0) throw new UnusableImageError(UNUSABLE_IMAGE_REASONS.unreadable);

  const parsed = probeSchema.safeParse(JSON.parse(result.stdout.toString('utf8')));
  const demuxer =
    parsed.success && DEMUXERS.find((name) => name === parsed.data.format.format_name);
  const stream = parsed.success ? parsed.data.streams[0] : undefined;
  if (!demuxer || !stream || stream.width < 1 || stream.height < 1) {
    throw new UnusableImageError(UNUSABLE_IMAGE_REASONS.unreadable);
  }
  if (stream.width * stream.height > MAX_PIXELS) {
    throw new UnusableImageError(UNUSABLE_IMAGE_REASONS.tooLarge);
  }
  return demuxer;
}
