'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COVER_CONTENT_TYPES, MAX_COVER_BYTES, type CoverResponse } from '@feedback/shared';
import { putFile } from '../../../lib/put-file';
import { useVersionStatus } from '../../../lib/use-version-status';
import { UploadProgress } from '../../upload-progress';
import { completeCoverUploadAction, getCoverAction, startCoverUploadAction } from '../actions';

type State =
  | { step: 'idle' }
  | { step: 'uploading'; progress: number }
  | { step: 'processing'; coverId: string }
  | { step: 'error'; message: string };

const MAX_MB = MAX_COVER_BYTES / 1024 / 1024;

/** The state a page load starts in: a cover still processing, or why the last one failed. */
function initialState(pending: CoverResponse | null): State {
  if (pending?.status === 'processing') return { step: 'processing', coverId: pending.id };
  if (pending?.status === 'failed') {
    return {
      step: 'error',
      message: `The new cover art couldn’t be used. ${pending.failureReason}`,
    };
  }
  return { step: 'idle' };
}

/**
 * Adds or changes a project's cover art: pick an image, it uploads straight to storage, then the
 * worker crops and cleans it (this polls until it's done, then refreshes the page).
 */
export function CoverControl({
  projectId,
  hasCover,
  pending,
}: {
  projectId: string;
  hasCover: boolean;
  /** The server's view of the newest cover upload, if it's processing or failed. */
  pending: CoverResponse | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(() => initialState(pending));
  const busy = state.step === 'uploading' || state.step === 'processing';

  async function upload(file: File) {
    const contentType = COVER_CONTENT_TYPES.find((type) => type === file.type);
    if (!contentType) {
      setState({ step: 'error', message: `${file.name} isn’t a JPEG, PNG, or WebP image.` });
      return;
    }
    if (file.size > MAX_COVER_BYTES) {
      setState({ step: 'error', message: `${file.name} is larger than ${MAX_MB} MB.` });
      return;
    }

    setState({ step: 'uploading', progress: 0 });
    try {
      const started = await startCoverUploadAction(projectId, {
        contentType,
        sizeBytes: file.size,
      });
      if (!started.ok) {
        setState({ step: 'error', message: started.message });
        return;
      }
      const { coverId, upload: target } = started.data;
      await putFile(target.url, target.headers, file, (progress) =>
        setState({ step: 'uploading', progress }),
      );
      const completed = await completeCoverUploadAction(projectId, coverId);
      if (!completed.ok) {
        setState({ step: 'error', message: completed.message });
        return;
      }
      // Failed right away (not an image after all): the refreshed page says why.
      if (completed.data.status === 'processing') setState({ step: 'processing', coverId });
      else router.refresh();
    } catch {
      setState({
        step: 'error',
        message: 'The upload didn’t finish. Check your connection and try again.',
      });
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={COVER_CONTENT_TYPES.join(',')}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        className="link -ml-1 inline-flex min-h-10 items-center px-1 text-sm text-muted disabled:cursor-not-allowed disabled:no-underline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {hasCover ? 'Change cover art' : 'Add cover art'}
      </button>
      {state.step === 'uploading' && (
        <div className="max-w-xs">
          <UploadProgress progress={state.progress} />
        </div>
      )}
      {state.step === 'processing' && (
        <CoverProcessing
          projectId={projectId}
          coverId={state.coverId}
          onDone={() => {
            setState({ step: 'idle' });
            router.refresh();
          }}
        />
      )}
      {state.step === 'error' && (
        <p role="alert" className="max-w-[65ch] text-sm text-danger">
          {state.message}
        </p>
      )}
    </div>
  );
}

/** Polls a processing cover until the worker finishes it, either way. */
function CoverProcessing({
  projectId,
  coverId,
  onDone,
}: {
  projectId: string;
  coverId: string;
  onDone: () => void;
}) {
  const fetchStatus = useCallback(async () => {
    const result = await getCoverAction(projectId, coverId);
    return result.ok ? result.data.status : null;
  }, [projectId, coverId]);
  const status = useVersionStatus('processing', fetchStatus);

  useEffect(() => {
    if (status !== 'processing') onDone();
  }, [status, onDone]);

  return (
    <p role="status" className="text-sm text-muted">
      Processing the cover art. It’s cropped square and cleaned of photo details like location.
    </p>
  );
}
