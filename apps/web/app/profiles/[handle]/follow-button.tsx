'use client';

import { SignInButton } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setFollowingAction } from './actions';

/**
 * Follow or Unfollow, for an approved account on someone else's page; Sign in to follow when
 * signed out. Plain HTML until the page is styled.
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
      <p>
        {/* A modal, so the page stays put. */}
        <SignInButton mode="modal">
          <button type="button">Sign in to follow</button>
        </SignInButton>
      </p>
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
    <p>
      <button type="button" onClick={toggle} disabled={pending}>
        {following ? 'Unfollow' : 'Follow'}
      </button>
      {following && ' You follow them: their new public tracks show up in your feed.'}
      {error && <span role="alert"> {error}</span>}
    </p>
  );
}
