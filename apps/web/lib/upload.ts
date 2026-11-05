import {
  AUDIO_CONTENT_TYPES,
  AUDIO_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  audioContentTypeFor,
  type CreateUploadResponse,
  type Visibility,
} from '@feedback/shared';
import type { ActionResult } from './action-result';

/** What a file input offers for audio. */
export const AUDIO_ACCEPT = [...AUDIO_EXTENSIONS, ...AUDIO_CONTENT_TYPES].join(',');

const MEGABYTE = 1024 * 1024;

/** Whether a drag is carrying files (not text or a link). */
export const carriesFiles = (event: { dataTransfer: DataTransfer }) =>
  event.dataTransfer.types.includes('Files');

/** "Late Night Idea.wav" → "Late Night Idea". */
export const titleFromFilename = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .trim()
    .slice(0, 200);

/** Why a file can't be uploaded, or null if it can. */
export function fileProblem(file: File): string | null {
  if (!audioContentTypeFor(file)) {
    return `${file.name} isn't a supported format. Upload an mp3, wav, m4a, aac, flac, or ogg file.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is larger than ${MAX_UPLOAD_BYTES / MEGABYTE} MB.`;
  }
  return null;
}

/** A file's size in words, e.g. 50_000_000 → "47.7 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < MEGABYTE) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / MEGABYTE).toFixed(1)} MB`;
}

/**
 * Who can hear a new track, given the project picked for it. A track never gets wider than private
 * by joining a wider project, but one in a private project follows that project from then on
 * (CLAUDE.md section 6, rule 7), so "private" alone would overpromise there.
 */
export function uploadPrivacy(project: { title: string; visibility: Visibility } | null): {
  lead: string;
  rest: string;
} {
  if (!project) return { lead: 'Private.', rest: 'Only you can hear this until you share it.' };
  switch (project.visibility) {
    case 'private':
      return {
        lead: 'Private for now.',
        rest: 'It will follow this project’s visibility if that changes.',
      };
    case 'unlisted':
      return {
        lead: 'Private.',
        rest: `Only you can hear this track, even though anyone with a link to ${project.title} can listen to the project. You can change that after it uploads.`,
      };
    case 'public':
      return {
        lead: 'Private.',
        rest: `Only you can hear this track, even though ${project.title} is public. You can change that after it uploads.`,
      };
  }
}

export type UploadProgressState = { step: 'uploading'; progress: number } | { step: 'finishing' };

export type UploadOutcome =
  { kind: 'done'; trackId: string } | { kind: 'failed'; message: string } | { kind: 'cancelled' };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const COMPLETE_ATTEMPTS = 3;

/**
 * Takes a file up: asks the API where to put it, sends it straight to storage, then hands it to
 * the worker. Aborting `signal` stops it wherever it is. A track or version left behind that way
 * is cleaned up by the worker's sweep (CLAUDE.md section 7), so nothing else needs undoing.
 */
export async function runUpload({
  signal,
  start,
  put,
  complete,
  onProgress,
  wait = delay,
}: {
  signal: AbortSignal;
  start: () => Promise<ActionResult<CreateUploadResponse>>;
  put: (
    upload: CreateUploadResponse['upload'],
    onProgress: (fraction: number) => void,
  ) => Promise<void>;
  complete: (versionId: string) => Promise<ActionResult<unknown>>;
  onProgress: (state: UploadProgressState) => void;
  wait?: (ms: number) => Promise<void>;
}): Promise<UploadOutcome> {
  onProgress({ step: 'uploading', progress: 0 });
  try {
    const started = await start();
    if (signal.aborted) return { kind: 'cancelled' };
    if (!started.ok) return { kind: 'failed', message: started.message };

    const { trackId, versionId, upload } = started.data;
    await put(upload, (progress) => onProgress({ step: 'uploading', progress }));
    if (signal.aborted) return { kind: 'cancelled' };

    onProgress({ step: 'finishing' });
    // "Complete" is safe to repeat, and a moment later usually works (e.g. the queue was busy).
    let completed: ActionResult<unknown> | null = null;
    for (let attempt = 1; attempt <= COMPLETE_ATTEMPTS && !completed?.ok; attempt++) {
      if (attempt > 1) await wait(2000);
      completed = await complete(versionId).catch(() => null);
    }
    if (!completed?.ok) {
      return {
        kind: 'failed',
        message: completed?.message ?? 'The file uploaded, but we couldn’t start processing it.',
      };
    }
    return { kind: 'done', trackId };
  } catch {
    if (signal.aborted) return { kind: 'cancelled' };
    return {
      kind: 'failed',
      message: 'The upload didn’t finish. Check your connection and try again.',
    };
  }
}
