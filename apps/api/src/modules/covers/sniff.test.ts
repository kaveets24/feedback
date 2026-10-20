import { describe, expect, it } from 'vitest';
import { sniffImage } from './sniff.ts';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)),
  );

describe('sniffImage', () => {
  it('recognizes JPEG, PNG, and WebP from their first bytes', () => {
    expect(sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0], 'JFIF'))).toBe('image/jpeg');
    expect(sniffImage(bytes([0x89], 'PNG\r\n', [0x1a, 0x0a], 'IHDR'))).toBe('image/png');
    expect(sniffImage(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses anything else, including look-alikes and short files', () => {
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(bytes('RIFF', [1, 2, 3, 4], 'WAVEfmt '))).toBeNull();
    expect(sniffImage(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8]))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
});
