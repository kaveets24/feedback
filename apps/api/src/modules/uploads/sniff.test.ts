import { describe, expect, it } from 'vitest';
import { sniffAudio } from './sniff.ts';

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );

describe('sniffAudio', () => {
  it.each([
    ['wav', bytes('RIFF', [0x24, 0, 0, 0], 'WAVE')],
    ['wav', bytes('RF64', [0xff, 0xff, 0xff, 0xff], 'WAVE')],
    ['flac', bytes('fLaC', [0, 0, 0, 0x22])],
    ['ogg', bytes('OggS', [0, 2])],
    ['m4a', bytes([0, 0, 0, 0x20], 'ftyp', 'M4A ')],
    ['mp3', bytes('ID3', [4, 0, 0])],
    ['mp3', bytes([0xff, 0xfb, 0x90, 0x64])], // MPEG-1 Layer III frame
    ['mp3', bytes([0xff, 0xf3, 0x90, 0x64])], // MPEG-2 Layer III frame
    ['aac', bytes([0xff, 0xf1, 0x50, 0x80])], // ADTS, MPEG-4
    ['aac', bytes([0xff, 0xf9, 0x50, 0x80])], // ADTS, MPEG-2
  ])('recognizes %s', (format, input) => {
    expect(sniffAudio(input)).toBe(format);
  });

  it.each([
    ['text', bytes('hello, world')],
    ['HTML', bytes('<!doctype html>')],
    ['a PNG', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a])],
    ['a RIFF that is not WAVE', bytes('RIFF', [0, 0, 0, 0], 'AVI ')],
    ['a reserved MPEG layer', bytes([0xff, 0xe0, 0, 0])],
    ['a lone 0xff', bytes([0xff])],
    ['nothing', bytes()],
  ])('rejects %s', (_label, input) => {
    expect(sniffAudio(input)).toBeNull();
  });
});
