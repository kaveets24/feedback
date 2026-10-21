'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COVER_CONTENT_TYPES,
  MAX_COVER_BYTES,
  type AvatarResponse,
  type CoverImage,
} from '@feedback/shared';
import { putFile } from '../../../lib/put-file';
import { useVersionStatus } from '../../../lib/use-version-status';
import { UploadProgress } from '../../upload-progress';
import {
  completeAvatarUploadAction,
  getAvatarAction,
  removeAvatarAction,
  startAvatarUploadAction,
} from './actions';
import { Avatar } from '../../_shell/avatar';

type State =
  | { step: 'idle' }
  | { step: 'uploading'; progress: number }
  | { step: 'processing'; avatarId: string }
  | { step: 'removing' }
  | { step: 'error'; message: string };

const MAX_MB = MAX_COVER_BYTES / 1024 / 1024;

/** The state a page load starts in: a picture still processing, or why the last one failed. */
function initialState(pending: AvatarResponse | null): State {
  if (pending?.status === 'processing') return { step: 'processing', avatarId: pending.id };
  if (pending?.status === 'failed') {
    return { step: 'error', message: `The new picture couldn’t be used. ${pending.failureReason}` };
  }
  return { step: 'idle' };
}

/**
 * The profile picture and its controls. Unlike the form below it, a picture saves on its own:
 * pick an image, it uploads straight to storage, then the worker crops and cleans it (this polls
 * until it's done, then refreshes the page).
 */
export function AvatarControl({
  avatar,
  pending,
}: {
  avatar: CoverImage | null;
  /** The server's view of the newest picture upload, if it's processing or failed. */
  pending: AvatarResponse | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(() => initialState(pending));
  const busy =
    state.step === 'uploading' || state.step === 'processing' || state.step === 'removing';

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
      const started = await startAvatarUploadAction({ contentType, sizeBytes: file.size });
      if (!started.ok) {
        setState({ step: 'error', message: started.message });
        return;
      }
      const { avatarId, upload: target } = started.data;
      await putFile(target.url, target.headers, file, (progress) =>
        setState({ step: 'uploading', progress }),
      );
      const completed = await completeAvatarUploadAction(avatarId);
      if (!completed.ok) {
        setState({ step: 'error', message: completed.message });
        return;
      }
      // Failed right away (not an image after all): the refreshed page says why.
      if (completed.data.status === 'processing') setState({ step: 'processing', avatarId });
      else router.refresh();
    } catch {
      setState({
        step: 'error',
        message: 'The upload didn’t finish. Check your connection and try again.',
      });
    }
  }

  async function remove() {
    setState({ step: 'removing' });
    const result = await removeAvatarAction();
    setState(result.ok ? { step: 'idle' } : { step: 'error', message: result.message });
    if (result.ok) router.refresh();
  }

  return (
    <section aria-labelledby="picture-heading" className="max-w-xl">
      <h2 id="picture-heading" className="mb-2 text-sm font-medium">
        Picture <span className="font-normal text-muted">(optional)</span>
      </h2>
      <div className="flex items-start gap-4">
        <Avatar avatar={avatar} size="page" />
        <div className="min-w-0 space-y-2">
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {avatar ? 'Change picture' : 'Upload a picture'}
            </button>
            {avatar && (
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={remove}>
                {state.step === 'removing' ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
          <p className="max-w-[65ch] text-sm text-muted">
            JPEG, PNG, or WebP, up to {MAX_MB} MB. It’s cropped square, and photo details like
            location are removed.
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 empty:hidden">
        {state.step === 'uploading' && (
          <div className="max-w-xs">
            <UploadProgress progress={state.progress} />
          </div>
        )}
        {state.step === 'processing' && (
          <AvatarProcessing
            avatarId={state.avatarId}
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
    </section>
  );
}

/** Polls a processing picture until the worker finishes it, either way. */
function AvatarProcessing({ avatarId, onDone }: { avatarId: string; onDone: () => void }) {
  const fetchStatus = useCallback(async () => {
    const result = await getAvatarAction(avatarId);
    return result.ok ? result.data.status : null;
  }, [avatarId]);
  const status = useVersionStatus('processing', fetchStatus);

  useEffect(() => {
    if (status !== 'processing') onDone();
  }, [status, onDone]);

  return (
    <p role="status" className="text-sm text-muted">
      Processing your picture…
    </p>
  );
}
