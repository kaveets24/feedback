'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  AUDIO_CONTENT_TYPES,
  AUDIO_EXTENSIONS,
  MAX_DURATION_MS,
  MAX_UPLOAD_BYTES,
  audioContentTypeFor,
} from '@feedback/shared';
import { putFile } from '../lib/put-file';
import {
  completeUploadAction,
  startUploadAction,
  startVersionUploadAction,
} from './upload-actions';
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

/** Why a file can't be uploaded, or null if it can. */
function fileProblem(file: File) {
  if (!audioContentTypeFor(file)) {
    return `${file.name} isn't a supported format. Upload an mp3, wav, m4a, aac, flac, or ogg file.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) return `${file.name} is larger than ${MAX_MB} MB.`;
  return null;
}

/** Whether a drag is carrying files (not text or a link). */
const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files');

/** "Complete" is safe to repeat, and a moment later usually works (e.g. the queue was busy). */
async function completeWithRetries(versionId: string) {
  for (let attempt = 1; ; attempt++) {
    const result = await completeUploadAction(versionId).catch(() => null);
    if (result?.ok || attempt === 3) return result;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

/**
 * Uploads audio: the file goes straight to storage, then the API hands it to the worker. On home
 * it makes a new track (with a title) and opens it. Given a `trackId` (the track page), it uploads
 * that track's next version (with optional change notes) and refreshes the page in place. A file
 * can also be dropped anywhere on the form; it's picked as if chosen, and Upload still sends it.
 */
export function UploadForm({ trackId: versionOf }: { trackId?: string } = {}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<State>({ step: 'idle' });
  const [dragging, setDragging] = useState(false);
  const busy = state.step === 'uploading' || state.step === 'finishing';
  const id = versionOf ? 'upload-version' : 'upload';

  function choose(chosen: File | null) {
    setFile(chosen);
    if (state.step === 'error') setState({ step: 'idle' });
    if (chosen && !versionOf && !title.trim()) setTitle(titleFromFilename(chosen.name));
  }

  function onDragOver(event: DragEvent<HTMLFormElement>) {
    if (busy || !carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function onDragLeave(event: DragEvent<HTMLFormElement>) {
    // Moving between the form's own children fires leave events too; only leaving the form counts.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLFormElement>) {
    if (busy || !carriesFiles(event)) return;
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (!dropped) return;
    const problem = fileProblem(dropped);
    if (problem) {
      setState({ step: 'error', message: problem });
      return;
    }
    // Put it in the input too, so it shows the file name and satisfies `required`.
    const picked = new DataTransfer();
    picked.items.add(dropped);
    if (fileRef.current) fileRef.current.files = picked.files;
    choose(dropped);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const problem = fileProblem(file);
    const contentType = audioContentTypeFor(file);
    if (problem || !contentType) {
      setState({ step: 'error', message: problem ?? 'That file can’t be uploaded.' });
      return;
    }

    setState({ step: 'uploading', progress: 0 });
    try {
      const fileFields = { filename: file.name, contentType, sizeBytes: file.size };
      const started = versionOf
        ? await startVersionUploadAction(versionOf, {
            ...fileFields,
            changeNotes: notes.trim() || null,
          })
        : await startUploadAction({
            ...fileFields,
            title: title.trim() || titleFromFilename(file.name),
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
      if (!versionOf) {
        router.push(`/tracks/${trackId}`);
        return;
      }
      // The new version shows up in the history, processing; clear the form for the next one.
      formRef.current?.reset();
      setFile(null);
      setNotes('');
      setState({ step: 'idle' });
      router.refresh();
    } catch {
      setState({
        step: 'error',
        message: 'The upload didn’t finish. Check your connection and try again.',
      });
    }
  }

  const submit = (
    <button type="submit" className="btn btn-primary" disabled={busy || !file}>
      {busy ? 'Uploading…' : versionOf ? 'Upload new version' : 'Upload'}
    </button>
  );

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      aria-labelledby={`${id}-heading`}
      className={`-m-3 rounded-lg p-3 ${dragging ? 'outline-2 outline-accent outline-dashed' : ''}`}
    >
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {versionOf ? 'Upload a new version' : 'Upload a track'}
      </h2>
      <p className="mt-1 max-w-[65ch] text-sm text-muted">
        {versionOf
          ? 'It becomes the next version, and plays here once it’s processed. '
          : 'New tracks are private: only you can see and hear them. '}
        mp3, wav, m4a, aac, flac, or ogg, up to {MAX_MB} MB and {MAX_MINUTES} minutes. Choose a file
        or drop one here.
      </p>

      <div className="mt-4 max-w-xl space-y-4">
        <div>
          <label htmlFor={`${id}-file`} className="mb-1 block text-sm font-medium">
            Audio file
          </label>
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            name="file"
            required
            disabled={busy}
            accept={[...AUDIO_EXTENSIONS, ...AUDIO_CONTENT_TYPES].join(',')}
            onChange={(event) => choose(event.target.files?.[0] ?? null)}
            className="focus-glow block w-fit max-w-full rounded-md text-sm text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-md file:border file:border-field-edge file:bg-chrome-lo file:px-4 file:text-sm file:font-medium file:text-ink enabled:hover:file:border-accent enabled:hover:file:text-accent disabled:cursor-not-allowed disabled:file:cursor-not-allowed disabled:file:border-rule disabled:file:text-muted"
          />
        </div>
        {versionOf ? (
          <>
            <div>
              <label htmlFor={`${id}-notes`} className="mb-1 block text-sm font-medium">
                What changed? <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id={`${id}-notes`}
                name="changeNotes"
                rows={3}
                maxLength={2000}
                disabled={busy}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="e.g. Louder vocals, new bridge"
                className="field"
              />
            </div>
            {submit}
          </>
        ) : (
          <div>
            <label htmlFor={`${id}-title`} className="mb-1 block text-sm font-medium">
              Title
            </label>
            <div className="flex gap-2">
              <input
                id={`${id}-title`}
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
              {submit}
            </div>
          </div>
        )}

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
