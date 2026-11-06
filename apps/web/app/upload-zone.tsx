'use client';

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { MAX_DURATION_MS, MAX_UPLOAD_BYTES } from '@feedback/shared';
import { AUDIO_ACCEPT, carriesFiles, fileProblem } from '../lib/upload';
import { UploadDialog, type UploadTarget } from './upload-dialog';

const FORMATS = `mp3, wav, m4a, aac, flac, or ogg, up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB and ${MAX_DURATION_MS / 60_000} minutes.`;

/**
 * Where audio comes in. Dropping a file or choosing one opens the upload dialog, and nothing goes
 * up until it's confirmed there. On your tracks it's the LCD deck, the page's one signature; on the
 * track page, where the player already is, it's a flat zone. Touch screens can't drag files, so
 * they're never told to.
 */
export function UploadZone({ target }: { target: UploadTarget }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<{ file: File; ignored: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A near miss would otherwise make the browser open the file in this tab, leaving the app.
  useEffect(() => {
    function refuse(event: globalThis.DragEvent) {
      if (event.defaultPrevented || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    }
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, []);

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const problem = fileProblem(file);
    setError(problem);
    if (!problem) setPicked({ file, ignored: files.length - 1 });
  }

  const dropEvents = {
    onDragOver(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    },
    onDragLeave(event: DragEvent) {
      // Moving between the zone's own children fires leave events too; only leaving it counts.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      pick(event.dataTransfer.files);
    },
    // The button inside needs no handler of its own: its click, by mouse or keyboard, lands here.
    onClick() {
      inputRef.current?.click();
    },
  };

  const footer: ReactNode = (
    <>
      {/* Outside the zone, since this input's own click would otherwise bubble back to it. */}
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          pick(event.target.files);
          // So choosing the same file again still counts as a change.
          event.target.value = '';
        }}
      />
      {error && (
        <p role="alert" className="mt-2 text-sm break-words text-danger">
          {error}
        </p>
      )}
      {picked && (
        <UploadDialog
          target={target}
          initialFile={picked.file}
          ignoredFiles={picked.ignored}
          onClosed={() => setPicked(null)}
        />
      )}
    </>
  );

  if (target.kind === 'version') {
    return (
      <section aria-labelledby="upload-version-heading">
        <h2 id="upload-version-heading" className="mb-3 text-lg font-semibold">
          Upload a new version
        </h2>
        <div
          {...dropEvents}
          className={`flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-4 ${
            dragging
              ? 'border-transparent bg-chrome-lo outline-2 outline-accent outline-dashed'
              : 'border-field-edge'
          }`}
        >
          <p className="min-w-0 flex-1 basis-56 text-sm text-muted">
            <span className="pointer-coarse:hidden">Drop the next version here. </span>
            It’s processed before anyone can hear it.
          </p>
          <button type="button" className="btn">
            Choose a file
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{FORMATS}</p>
        {footer}
      </section>
    );
  }

  return (
    <section aria-labelledby="upload-heading">
      <h2 id="upload-heading" className="sr-only">
        Upload a track
      </h2>
      <div
        {...dropEvents}
        className={`lcd m-[3px] cursor-pointer p-4 ${dragging ? 'lcd-lit' : ''}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div
            className={`min-w-0 flex-1 basis-56 ${dragging ? 'text-lcd-ink' : 'text-lcd-unlit'}`}
          >
            <p className="font-lcd text-lg leading-tight">
              {dragging ? 'DROP TO LOAD' : 'NO FILE LOADED'}
            </p>
            <p className="mt-1.5 text-sm">
              {dragging ? (
                'Details come next. Nothing uploads until you press Upload.'
              ) : (
                <>
                  <span className="pointer-coarse:hidden">Drop a track here. </span>
                  New tracks are private: only you can hear them.
                </>
              )}
            </p>
          </div>
          {/* Hidden, not removed, while a file is held: it can't be pressed then, and the deck stays put. */}
          <button type="button" className={`btn btn-primary ${dragging ? 'invisible' : ''}`}>
            Choose a file
          </button>
        </div>
        {/* The upload bar's empty track: the slot is waiting, and lights with what's held over it. */}
        <div
          aria-hidden="true"
          className={`mt-3 h-3 rounded-[2px] ${dragging ? 'progress-ready' : 'progress-unlit'}`}
        />
      </div>
      <p className="mt-2 text-sm text-muted">{FORMATS}</p>
      {footer}
    </section>
  );
}
