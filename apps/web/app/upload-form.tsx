'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  AUDIO_CONTENT_TYPES,
  AUDIO_EXTENSIONS,
  MAX_DURATION_MS,
  MAX_UPLOAD_BYTES,
  audioContentTypeFor,
} from '@feedback/shared';
import { putFile } from '../lib/put-file';
import { completeUploadAction, startUploadAction } from './upload-actions';
import { UploadProgress } from './upload-progress';

type State =
  | { step: 'idle' }
  | { step: 'uploading'; progress: number }
  | { step: 'finishing' }
  | { step: 'error'; message: string };

const MAX_MB = MAX_UPLOAD_BYTES / 1024 / 1024;
const MAX_MINUTES = MAX_DURATION_MS / 60_000;

/** "Late Night Idea.wav" → "Late Night Idea". */
const titleFromFilename = (name: string) =>
  name
    .replace(/\.[^.]+$/, '')
    .trim()
    .slice(0, 200);

/** "Complete" is safe to repeat, and a moment later usually works (e.g. the queue was busy). */
async function completeWithRetries(versionId: string) {
  for (let attempt = 1; ; attempt++) {
    const result = await completeUploadAction(versionId).catch(() => null);
    if (result?.ok || attempt === 3) return result;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/** Uploads a new track: the file goes straight to storage, then the API hands it to the worker. */
export function UploadForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: 'idle' });
  const busy = state.step === 'uploading' || state.step === 'finishing';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const contentType = audioContentTypeFor(file);
    if (!contentType) {
      setState({
        step: 'error',
        message: `${file.name} isn't a supported format. Upload an mp3, wav, m4a, aac, flac, or ogg file.`,
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setState({ step: 'error', message: `${file.name} is larger than ${MAX_MB} MB.` });
      return;
    }

    setState({ step: 'uploading', progress: 0 });
    try {
      const started = await startUploadAction({
        title: title.trim() || titleFromFilename(file.name),
        filename: file.name,
        contentType,
        sizeBytes: file.size,
      });
      if (!started.ok) {
        setState({ step: 'error', message: started.message });
        return;
      }
      const { trackId, versionId, upload } = started.data;
      await putFile(upload.url, upload.headers, file, (progress) =>
        setState({ step: 'uploading', progress }),
      );

      setState({ step: 'finishing' });
      const completed = await completeWithRetries(versionId);
      if (!completed?.ok) {
        setState({
          step: 'error',
          message: completed?.message ?? 'The file uploaded, but we couldn’t start processing it.',
        });
        return;
      }
      router.push(`/tracks/${trackId}`);
    } catch {
      setState({
        step: 'error',
        message: 'The upload didn’t finish. Check your connection and try again.',
      });
    }
  }

  return (
    <form onSubmit={onSubmit} aria-labelledby="upload-heading">
      <h2 id="upload-heading" className="text-lg font-semibold">
        Upload a track
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">
        New tracks are private: only you can see and hear them. mp3, wav, m4a, aac, flac, or ogg, up
        to {MAX_MB} MB and {MAX_MINUTES} minutes.
      </p>

      <div className="mt-4 max-w-xl space-y-4">
        <div>
          <label htmlFor="upload-file" className="mb-1 block text-sm font-medium">
            Audio file
          </label>
          <input
            id="upload-file"
            type="file"
            name="file"
            required
            disabled={busy}
            accept={[...AUDIO_EXTENSIONS, ...AUDIO_CONTENT_TYPES].join(',')}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null;
              setFile(chosen);
              if (chosen && !title.trim()) setTitle(titleFromFilename(chosen.name));
            }}
            className="focus-glow block w-fit max-w-full rounded-md text-sm text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-field-edge file:bg-chrome-lo file:px-4 file:text-sm file:font-medium file:text-ink enabled:hover:file:border-accent enabled:hover:file:text-accent disabled:cursor-not-allowed disabled:file:cursor-not-allowed disabled:file:border-rule disabled:file:text-muted"
          />
        </div>
        <div>
          <label htmlFor="upload-title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <div className="flex gap-2">
            <input
              id="upload-title"
              type="text"
              name="title"
              required
              maxLength={200}
              disabled={busy}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Fills in from the file name"
              className="field min-w-0"
            />
            <button type="submit" className="btn btn-primary" disabled={busy || !file}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>

        {state.step === 'uploading' && <UploadProgress progress={state.progress} />}
        {state.step === 'finishing' && <UploadProgress progress={1} />}
        <p role="status" className="text-sm text-muted empty:hidden">
          {state.step === 'finishing' ? 'Upload complete. Starting processing…' : ''}
        </p>
        {state.step === 'error' && (
          <p role="alert" className="text-sm text-danger">
            {state.message}
          </p>
        )}
      </div>
    </form>
  );
}
