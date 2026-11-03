'use client';

import { SignInButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setFollowingAction } from './actions';

/**
 * Follow (primary) or Unfollow (default, with a line on what following does), for an approved
 * account on someone else's page; Sign in to follow when signed out.
 */
export function FollowButton({
  handle,
  following,
  signedIn,
}: {
  handle: string;
  following: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="shrink-0">
        {/* A modal, so the page stays put. */}
        <SignInButton mode="modal">
          <button type="button" className="btn">
            Sign in to follow
          </button>
        </SignInButton>
      </div>
    );
  }

  const toggle = () =>
    startTransition(async () => {
      setError(null);
      const result = await setFollowingAction(handle, !following);
      if (!result.ok) setError(result.message);
      router.refresh();
    });

  return (
    <div className="flex shrink-0 flex-col items-start gap-2 sm:max-w-64 sm:items-end">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={following ? 'btn' : 'btn btn-primary'}
      >
        {pending ? (following ? 'Unfollowing…' : 'Following…') : following ? 'Unfollow' : 'Follow'}
      </button>
      {following && !pending && (
        <p className="text-sm text-balance text-muted sm:text-right">
          You follow them. Their new public tracks and versions show up in your feed.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger sm:text-right">
          {error}
        </p>
      )}
    </div>
  );
}
