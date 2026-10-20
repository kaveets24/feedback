import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { crc32 } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { encodeCover, UNUSABLE_IMAGE_REASONS, UnusableImageError } from './ffmpeg.ts';

const exec = promisify(execFile);

/** A 1x1 lossless WebP (the ffmpeg builds here can decode WebP but not encode it). */
const WEBP_1X1 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cover-ffmpeg-'));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

/** Writes an image from ffmpeg's lavfi sources, e.g. two colours side by side. */
async function image(name: string, filter: string) {
  const path = join(dir, name);
  await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', filter, '-frames:v', '1', path]);
  return path;
}

/** A red|blue JPEG 400x200, tagged "rotate 90° clockwise" (EXIF Orientation 6) like a phone. */
async function rotatedPhoto() {
  const plain = await image(
    'plain.jpg',
    'color=red:s=200x200[a];color=blue:s=200x200[b];[a][b]hstack',
  );
  const ifd = Buffer.alloc(18);
  ifd.writeUInt16BE(1, 0); // one entry
  ifd.writeUInt16BE(0x0112, 2); // Orientation
  ifd.writeUInt16BE(3, 4); // SHORT
  ifd.writeUInt32BE(1, 6);
  ifd.writeUInt16BE(6, 10);
  const tiff = Buffer.concat([Buffer.from('MM\0*'), Buffer.from([0, 0, 0, 8]), ifd]);
  // GPS-like text too, to prove nothing from the original's EXIF survives.
  const app1 = Buffer.concat([Buffer.from('Exif\0\0'), tiff, Buffer.from('GPS 51.5N 0.12W')]);
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1]), u16(app1.length + 2), app1]);
  const jpeg = await readFile(plain);
  const path = join(dir, 'rotated.jpg');
  await writeFile(path, Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)]));
  return path;
}

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};

/** A PNG whose header claims 10000x10000 but holds almost nothing: a decompression bomb. */
async function bombPng() {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(10_000, 0);
  ihdr.writeUInt32BE(10_000, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const path = join(dir, 'bomb.png');
  await writeFile(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', Buffer.alloc(0)),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  );
  return path;
}

async function size(path: string) {
  const { stdout } = await exec('ffprobe', [
    ...['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
  ]);
  return stdout.trim();
}

/** The colour at (x, y), as [r, g, b], sampled from a 2x2 crop (4:2:0 chroma needs 2 pixels). */
async function pixel(path: string, x: number, y: number) {
  const { stdout } = await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      path,
      '-vf',
      `crop=w=2:h=2:x=${x}:y=${y},format=rgb24`,
      '-f',
      'rawvideo',
      '-',
    ],
    { encoding: 'buffer' },
  );
  return [...stdout.subarray(0, 3)];
}

const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 60 && b! < 60;
const isBlue = ([r, g, b]: number[]) => b! > 200 && r! < 60 && g! < 60;

describe('encodeCover', () => {
  it('turns a phone photo upright, crops it square, and keeps none of its metadata', async () => {
    const output = join(dir, 'upright.jpg');
    await encodeCover(await rotatedPhoto(), output);

    expect(await size(output)).toBe('200,200');
    // Rotated a quarter turn clockwise, the red left half is now on top.
    expect(isRed(await pixel(output, 100, 6))).toBe(true);
    expect(isBlue(await pixel(output, 100, 192))).toBe(true);
    const bytes = await readFile(output);
    expect(bytes.includes('Exif')).toBe(false);
    expect(bytes.includes('GPS')).toBe(false);
  });

  it('scales large images down to 1024 a side, and never scales small ones up', async () => {
    const large = join(dir, 'large-out.jpg');
    await encodeCover(await image('large.png', 'color=green:s=3000x2000'), large);
    expect(await size(large)).toBe('1024,1024');

    const small = join(dir, 'small-out.jpg');
    await encodeCover(await image('small.png', 'color=green:s=301x157'), small);
    // Square at an even size, rounded down, whatever the ffmpeg version does with odd ones.
    expect(await size(small)).toBe('156,156');
  });

  it('reads WebP, and PNG with transparency', async () => {
    const webp = join(dir, 'in.webp');
    await writeFile(webp, Buffer.from(WEBP_1X1, 'base64'));
    await encodeCover(webp, join(dir, 'webp-out.jpg'));
    // The smallest output is 2x2.
    expect(await size(join(dir, 'webp-out.jpg'))).toBe('2,2');

    const alpha = await image('alpha.png', 'color=red@0.5:s=64x64,format=rgba');
    await encodeCover(alpha, join(dir, 'alpha-out.jpg'));
    expect(await size(join(dir, 'alpha-out.jpg'))).toBe('64,64');
  });

  it.each([
    ['a GIF (not an accepted format)', () => image('in.gif', 'color=red:s=64x64'), 'unreadable'],
    [
      'random bytes',
      async () => {
        const path = join(dir, 'noise.jpg');
        await writeFile(path, crypto.getRandomValues(new Uint8Array(4096)));
        return path;
      },
      'unreadable',
    ],
    ['a PNG claiming 100 megapixels', bombPng, 'tooLarge'],
  ] as const)('refuses %s as unusable', async (_label, make, reason) => {
    const error = await encodeCover(await make(), join(dir, 'never.jpg')).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(UnusableImageError);
    expect((error as UnusableImageError).reason).toBe(UNUSABLE_IMAGE_REASONS[reason]);
  });
});
