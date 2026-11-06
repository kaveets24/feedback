import { describe, expect, it, vi } from 'vitest';
import { MAX_UPLOAD_BYTES, type CreateUploadResponse } from '@feedback/shared';
import type { ActionResult } from './action-result';
import {
  fileProblem,
  formatFileSize,
  runUpload,
  titleFromFilename,
  uploadPrivacy,
  versionPrivacy,
  type UploadProgressState,
} from './upload';

const audio = (name = 'idea.wav', type = 'audio/wav') => new File(['x'], name, { type });

describe('titleFromFilename', () => {
  it('drops the extension and trims', () => {
    expect(titleFromFilename(' Late Night Idea .wav')).toBe('Late Night Idea');
    expect(titleFromFilename('no-extension')).toBe('no-extension');
  });

  it('keeps to the longest title', () => {
    expect(titleFromFilename(`${'x'.repeat(300)}.wav`)).toHaveLength(200);
  });
});

describe('fileProblem', () => {
  it('accepts supported audio, by type or by extension', () => {
    expect(fileProblem(audio())).toBeNull();
    expect(fileProblem(audio('idea.flac', ''))).toBeNull();
  });

  it('says why anything else is refused', () => {
    expect(fileProblem(audio('notes.pdf', 'application/pdf'))).toContain("isn't a supported");
    const huge = audio();
    Object.defineProperty(huge, 'size', { value: MAX_UPLOAD_BYTES + 1 });
    expect(fileProblem(huge)).toContain('larger than 200 MB');
  });
});

describe('formatFileSize', () => {
  it('reads in KB under a megabyte and MB above', () => {
    expect(formatFileSize(10)).toBe('1 KB');
    expect(formatFileSize(512 * 1024)).toBe('512 KB');
    expect(formatFileSize(50_000_000)).toBe('47.7 MB');
  });
});

// The wording is a promise about who can hear unfinished work, so each case is pinned.
describe('uploadPrivacy', () => {
  const project = (visibility: 'private' | 'unlisted' | 'public') => ({
    title: 'Summer EP',
    visibility,
  });

  it('is plainly private with no project', () => {
    expect(uploadPrivacy(null)).toEqual({
      lead: 'Private.',
      rest: 'Only you can hear this until you share it.',
    });
  });

  it('warns that a track in a private project follows it, since it gets no override', () => {
    const { lead, rest } = uploadPrivacy(project('private'));
    expect(lead).toBe('Private for now.');
    expect(rest).toContain('follow this project');
  });

  it.each(['unlisted', 'public'] as const)('stays private in a project that is %s', (level) => {
    const { lead, rest } = uploadPrivacy(project(level));
    expect(lead).toBe('Private.');
    expect(rest).toContain('Only you can hear this track, even though');
    expect(rest).toContain('Summer EP');
  });
});

describe('versionPrivacy', () => {
  it('says who hears a new version at each visibility', () => {
    expect(versionPrivacy('private')).toEqual({
      lead: 'Private.',
      rest: 'Only you can hear this until you share the track.',
    });
    expect(versionPrivacy('unlisted').rest).toContain('Anyone with a link can hear this version');
    expect(versionPrivacy('public').lead).toBe('Public.');
    expect(versionPrivacy('public').rest).toContain('Anyone can hear this version');
    expect(versionPrivacy('public').rest).toContain('followers');
  });
});

describe('runUpload', () => {
  const started: ActionResult<CreateUploadResponse> = {
    ok: true,
    data: {
      trackId: 'track-1',
      versionId: 'version-1',
      upload: {
        url: 'https://storage.test/put',
        method: 'PUT',
        headers: { 'content-type': 'audio/wav' },
        expiresAt: new Date(0).toISOString(),
      },
    },
  };
  const ok: ActionResult<unknown> = { ok: true, data: null };

  function setup(overrides: Partial<Parameters<typeof runUpload>[0]> = {}) {
    const seen: UploadProgressState[] = [];
    const deps = {
      signal: new AbortController().signal,
      start: vi.fn(async () => started),
      put: vi.fn(async (_upload, onProgress: (fraction: number) => void) => onProgress(0.5)),
      complete: vi.fn(async () => ok),
      onProgress: (state: UploadProgressState) => seen.push(state),
      wait: vi.fn(async () => {}),
      ...overrides,
    } satisfies Parameters<typeof runUpload>[0];
    return { seen, deps };
  }

  it('starts, sends the file, hands it over, and reports each step', async () => {
    const { deps, seen } = setup();
    await expect(runUpload(deps)).resolves.toEqual({ kind: 'done', trackId: 'track-1' });
    expect(deps.put).toHaveBeenCalledWith(
      (started as { data: CreateUploadResponse }).data.upload,
      expect.any(Function),
    );
    expect(deps.complete).toHaveBeenCalledWith('version-1');
    expect(seen).toEqual([
      { step: 'uploading', progress: 0 },
      { step: 'uploading', progress: 0.5 },
      { step: 'finishing' },
    ]);
  });

  it('passes on why the API refused, and sends nothing', async () => {
    const { deps } = setup({
      start: async () => ({ ok: false, message: 'That project is gone.' }),
    });
    await expect(runUpload(deps)).resolves.toEqual({
      kind: 'failed',
      message: 'That project is gone.',
    });
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('reports a failed transfer without handing anything over', async () => {
    const { deps } = setup({ put: async () => Promise.reject(new Error('offline')) });
    await expect(runUpload(deps)).resolves.toEqual({
      kind: 'failed',
      message: expect.stringContaining('didn’t finish'),
    });
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('retries the hand-over, waiting between tries', async () => {
    const complete = vi
      .fn<() => Promise<ActionResult<unknown>>>()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValueOnce({ ok: false, message: 'Queue busy' })
      .mockResolvedValueOnce(ok);
    const { deps } = setup({ complete });
    await expect(runUpload(deps)).resolves.toEqual({ kind: 'done', trackId: 'track-1' });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(deps.wait).toHaveBeenCalledTimes(2);
  });

  it('gives up on the hand-over after three tries, with the last reason', async () => {
    const complete = vi.fn(async () => ({ ok: false as const, message: 'Queue busy' }));
    const { deps } = setup({ complete });
    await expect(runUpload(deps)).resolves.toEqual({ kind: 'failed', message: 'Queue busy' });
    expect(complete).toHaveBeenCalledTimes(3);
  });

  it('says the file arrived when the hand-over keeps throwing', async () => {
    const { deps } = setup({ complete: async () => Promise.reject(new Error('down')) });
    await expect(runUpload(deps)).resolves.toEqual({
      kind: 'failed',
      message: expect.stringContaining('The file uploaded'),
    });
  });

  it('stops without sending the file if cancelled while starting', async () => {
    const controller = new AbortController();
    const { deps } = setup({
      signal: controller.signal,
      start: async () => {
        controller.abort();
        return started;
      },
    });
    await expect(runUpload(deps)).resolves.toEqual({ kind: 'cancelled' });
    expect(deps.put).not.toHaveBeenCalled();
  });

  it('treats a transfer stopped by cancelling as cancelled, not as a failure', async () => {
    const controller = new AbortController();
    const { deps } = setup({
      signal: controller.signal,
      put: async () => {
        controller.abort();
        throw new DOMException('Cancelled', 'AbortError');
      },
    });
    await expect(runUpload(deps)).resolves.toEqual({ kind: 'cancelled' });
    expect(deps.complete).not.toHaveBeenCalled();
  });
});
