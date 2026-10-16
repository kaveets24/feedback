// Recognizes the audio formats we accept (CLAUDE.md section 7) from a file's first bytes, so a
// file isn't trusted for its name or declared type. This is a quick gate before queueing work;
// the worker's ffmpeg is the real check, and it rejects files that only look right.

export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'aac' | 'flac' | 'ogg';

/** How many leading bytes `sniffAudio` needs. */
export const SNIFF_BYTES = 12;

const ascii = (bytes: Uint8Array, start: number, text: string) =>
  [...text].every((char, i) => bytes[start + i] === char.charCodeAt(0));

/** The format the bytes start like, or null if they don't look like supported audio. */
export function sniffAudio(bytes: Uint8Array): AudioFormat | null {
  if ((ascii(bytes, 0, 'RIFF') || ascii(bytes, 0, 'RF64')) && ascii(bytes, 8, 'WAVE')) {
    return 'wav';
  }
  if (ascii(bytes, 0, 'fLaC')) return 'flac';
  if (ascii(bytes, 0, 'OggS')) return 'ogg';
  if (ascii(bytes, 4, 'ftyp')) return 'm4a';
  // An ID3v2 tag usually fronts an MP3 (it can front AAC too; ffmpeg sorts that out).
  if (ascii(bytes, 0, 'ID3')) return 'mp3';

  const [b0, b1] = bytes;
  if (b0 === 0xff && b1 !== undefined) {
    // ADTS (raw AAC): 12-bit sync, then layer bits 00.
    if ((b1 & 0xf6) === 0xf0) return 'aac';
    // MPEG audio frame: 11-bit sync, then a layer other than the reserved 00.
    if ((b1 & 0xe0) === 0xe0 && (b1 & 0x06) !== 0) return 'mp3';
  }
  return null;
}
