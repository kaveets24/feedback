import { describe, expect, it } from 'vitest';
import { AUDIO_EXTENSIONS, audioContentTypeFor } from './uploads.ts';

describe('audioContentTypeFor', () => {
  it('keeps a type the browser reports, if we accept it', () => {
    expect(audioContentTypeFor({ name: 'demo.m4a', type: 'audio/x-m4a' })).toBe('audio/x-m4a');
    expect(audioContentTypeFor({ name: 'demo', type: 'Audio/MPEG' })).toBe('audio/mpeg');
  });

  it.each([
    ['take 3.FLAC', '', 'audio/flac'],
    ['idea.m4a', '', 'audio/mp4'],
    ['idea.aac', 'audio/vnd.dlna.adts', 'audio/aac'],
    ['idea.wav', 'application/octet-stream', 'audio/wav'],
  ])('falls back to the extension of %s (reported %j)', (name, type, expected) => {
    expect(audioContentTypeFor({ name, type })).toBe(expected);
  });

  it('rejects other formats', () => {
    expect(audioContentTypeFor({ name: 'song.aiff', type: 'audio/aiff' })).toBeNull();
    expect(audioContentTypeFor({ name: 'notes.txt', type: 'text/plain' })).toBeNull();
    expect(audioContentTypeFor({ name: 'noextension', type: '' })).toBeNull();
  });

  it('lists the accepted extensions', () => {
    expect(AUDIO_EXTENSIONS).toEqual(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg']);
  });
});
