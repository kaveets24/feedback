'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  GENRE_LABELS,
  GENRE_OPTIONS,
  audioContentTypeFor,
  type Visibility,
} from '@feedback/shared';
import { putFile } from '../lib/put-file';
import {
  AUDIO_ACCEPT,
  carriesFiles,
  fileProblem,
  formatFileSize,
  runUpload,
  titleFromFilename,
  uploadPrivacy,
  versionPrivacy,
  type UploadProgressState,
} from '../lib/upload';
import { SelectField } from './_shell/select-field';
import {
  completeUploadAction,
  startUploadAction,
  startVersionUploadAction,
} from './upload-actions';
import { UploadProgress } from './upload-progress';

export type UploadProject = { id: string; title: string; visibility: Visibility };

/** What an upload makes: a new track (optionally in a project), or a track's next version. */
export type UploadTarget =
  | { kind: 'track'; projects: UploadProject[] }
  | { kind: 'version'; trackId: string; visibility: Visibility };

const NOTES_MAX = 2000;

/**
 * Everything an upload asks for, on one screen, so nothing has to be entered again afterwards.
 * Nothing goes up until it's confirmed here. While the file is going up the form gives way to the
 * progress bar and the dialog can only be left by cancelling, since a stray Escape shouldn't throw
 * away a long upload.
 */
export function UploadDialog({
  target,
  initialFile,
  ignoredFiles,
  onClosed,
}: {
  target: UploadTarget;
  initialFile: File;
  /** How many other files came with this one in a drop. Only one goes up. */
  ignoredFiles: number;
  onClosed: () => void;
}) {
  const router = useRouter();
  const ids = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const changeInputRef = useRef<HTMLInputElement>(null);
  const uploadingHeadingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Read by the dialog's own events, which must not see a stale render.
  const busyRef = useRef(false);

  const [file, setFile] = useState(initialFile);
  const [title, setTitle] = useState(titleFromFilename(initialFile.name));
  const [projectId, setProjectId] = useState('');
  const [genre, setGenre] = useState('');
  const [notes, setNotes] = useState('');
  const [prompt, setPrompt] = useState('');
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // A keyboard on a phone would cover the form before it's been seen.
    if (window.matchMedia('(pointer: fine)').matches) {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select();
    }
  }, []);

  // The focused control disappears when the form swaps with the progress bar and back. The heading
  // takes focus rather than Cancel upload, so a second press of Enter can't throw the upload away.
  const uploading = progress !== null;
  const wasUploading = useRef(false);
  useEffect(() => {
    if (uploading) uploadingHeadingRef.current?.focus();
    else if (wasUploading.current) submitRef.current?.focus();
    wasUploading.current = uploading;
  }, [uploading]);

  function changeFile(files: FileList | null) {
    const next = files?.[0];
    if (!next) return;
    const problem = fileProblem(next);
    setError(problem);
    if (problem) return;
    // A title the artist typed stays; one that only came from the old file name follows the new.
    setTitle((current) =>
      current === titleFromFilename(file.name) ? titleFromFilename(next.name) : current,
    );
    setFile(next);
  }

  /** A file dropped on the dialog replaces this one, and never makes the browser open it. */
  function onDragOver(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busyRef.current ? 'none' : 'copy';
  }
  function onDrop(event: DragEvent) {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    if (!busyRef.current) changeFile(event.dataTransfer.files);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const contentType = audioContentTypeFor(file);
    if (!contentType) return;
    const fileFields = { filename: file.name, contentType, sizeBytes: file.size };

    const controller = new AbortController();
    abortRef.current = controller;
    busyRef.current = true;
    setError(null);

    const outcome = await runUpload({
      signal: controller.signal,
      start: () =>
        target.kind === 'version'
          ? startVersionUploadAction(target.trackId, {
              ...fileFields,
              changeNotes: notes.trim() || null,
              feedbackPrompt: prompt.trim() || null,
            })
          : startUploadAction({
              ...fileFields,
              title: title.trim() || titleFromFilename(file.name),
              projectId: projectId || undefined,
              genre: genre || undefined,
              feedbackPrompt: prompt.trim() || null,
            }),
      put: (upload, onProgress) =>
        putFile(upload.url, upload.headers, file, onProgress, controller.signal),
      complete: completeUploadAction,
      onProgress: setProgress,
    });

    if (outcome.kind === 'done' && target.kind === 'track') {
      // Stays up, still busy, until the track page takes over.
      router.push(`/tracks/${outcome.trackId}`);
      return;
    }
    busyRef.current = false;
    setProgress(null);
    if (outcome.kind === 'failed') {
      setError(outcome.message);
      return;
    }
    dialogRef.current?.close();
    if (outcome.kind === 'done') router.refresh();
  }

  const headingId = `${ids}-heading`;
  const privacy =
    target.kind === 'track'
      ? uploadPrivacy(target.projects.find((project) => project.id === projectId) ?? null)
      : versionPrivacy(target.visibility);
  const name = target.kind === 'track' ? title.trim() || titleFromFilename(file.name) : null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onCancel={(event) => {
        if (busyRef.current) event.preventDefault();
      }}
      onClose={() => {
        // Browsers let a second Escape past a prevented cancel; an upload outlasts that too.
        if (busyRef.current) dialogRef.current?.showModal();
        else onClosed();
      }}
      className="m-auto h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-canvas p-5 text-ink backdrop:bg-chrome-edge/80 sm:h-fit sm:max-h-[calc(100dvh-2rem)] sm:max-w-lg sm:rounded-lg sm:border sm:border-field-edge"
    >
      {uploading ? (
        <>
          <h2
            ref={uploadingHeadingRef}
            id={headingId}
            tabIndex={-1}
            className="mb-3 text-lg font-semibold break-words outline-none"
          >
            {name ? `Uploading ${name}` : 'Uploading a new version'}
          </h2>
          <p className="mb-4 border-b border-rule pb-3 text-sm font-medium break-all">
            {file.name}
          </p>
          <UploadProgress progress={progress.step === 'finishing' ? 1 : progress.progress} />
          <p role="status" className="mt-4 text-sm text-muted">
            {progress.step === 'finishing'
              ? 'Upload complete. Starting processing…'
              : target.kind === 'track'
                ? 'Keep this open until it finishes. The track page opens when it’s done.'
                : 'Keep this open until it finishes.'}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="btn"
              disabled={progress.step === 'finishing'}
              onClick={() => abortRef.current?.abort()}
            >
              Cancel upload
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit}>
          <h2 id={headingId} className="mb-3 text-lg font-semibold">
            {target.kind === 'track' ? 'Upload a track' : 'Upload a new version'}
          </h2>

          <div className="mb-4 border-b border-rule pb-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 text-sm break-all">
                <span className="font-medium">{file.name}</span>
                <span className="text-muted"> · {formatFileSize(file.size)}</span>
              </p>
              <button
                type="button"
                className="btn shrink-0"
                aria-label={`Change file, ${file.name}`}
                onClick={() => changeInputRef.current?.click()}
              >
                Change
              </button>
              <input
                ref={changeInputRef}
                type="file"
                accept={AUDIO_ACCEPT}
                hidden
                aria-hidden="true"
                tabIndex={-1}
                onChange={(event) => {
                  changeFile(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>
            {ignoredFiles > 0 && (
              <p className="mt-2 text-sm text-muted">
                Only this file will upload.{' '}
                {ignoredFiles === 1
                  ? 'Add the other one separately.'
                  : 'Add the others one at a time.'}
              </p>
            )}
          </div>

          <div className="space-y-4">
            {target.kind === 'track' ? (
              <>
                <div>
                  <label htmlFor={`${ids}-title`} className="mb-1 block text-sm font-medium">
                    Title
                  </label>
                  <input
                    ref={firstFieldRef}
                    id={`${ids}-title`}
                    type="text"
                    required
                    maxLength={200}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="field"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-3">
                  <SelectField
                    id={`${ids}-project`}
                    label="Project"
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value)}
                  >
                    <option value="">None</option>
                    {target.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id={`${ids}-genre`}
                    label="Genre"
                    value={genre}
                    onChange={(event) => setGenre(event.target.value)}
                  >
                    <option value="">None</option>
                    {GENRE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {GENRE_LABELS[option]}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor={`${ids}-notes`} className="mb-1 block text-sm font-medium">
                  What changed? <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  ref={firstFieldRef}
                  id={`${ids}-notes`}
                  rows={3}
                  maxLength={NOTES_MAX}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g. Louder vocals, new bridge"
                  className="field"
                />
              </div>
            )}
            <div>
              <label htmlFor={`${ids}-prompt`} className="mb-1 block text-sm font-medium">
                What do you want feedback on?{' '}
                <span className="font-normal text-muted">(optional)</span>
              </label>
              <textarea
                id={`${ids}-prompt`}
                rows={3}
                maxLength={NOTES_MAX}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={
                  target.kind === 'track'
                    ? 'e.g. Is the vocal too loud in the chorus?'
                    : 'e.g. Is the bridge too long?'
                }
                className="field"
              />
            </div>

            <p aria-live="polite" className="text-sm break-words text-muted">
              <span className="font-medium text-ink">{privacy.lead}</span> {privacy.rest}
            </p>
            {error && (
              <p role="alert" className="text-sm break-words text-danger">
                {error}
              </p>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
                Cancel
              </button>
              <button ref={submitRef} type="submit" className="btn btn-primary">
                {target.kind === 'track' ? 'Upload' : 'Upload new version'}
              </button>
            </div>
          </div>
        </form>
      )}
    </dialog>
  );
}
