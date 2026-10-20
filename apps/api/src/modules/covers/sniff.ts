import type { CoverContentType } from '@feedback/shared';

/** How many leading bytes `sniffImage` needs. */
export const IMAGE_SNIFF_BYTES = 12;

const startsWith = (bytes: Uint8Array, prefix: number[], offset = 0) =>
  prefix.every((byte, i) => bytes[offset + i] === byte);
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

/**
 * Which accepted image type a file is, from its first bytes, or null if it's none of them. The
 * declared type and the name can lie; the bytes are what ffmpeg will actually read.
 */
export function sniffImage(bytes: Uint8Array): CoverContentType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, ...ascii('PNG\r\n'), 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}
