'use client';

import { useAuth, useClerk } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { safeReturnUrl, type AuthModal } from '../../lib/auth-return';

/**
 * Opens Clerk's modal for a visit to `/sign-in` or `/sign-up`, which arrive here as home with the
 * modal asked for. Clears the address once open, so a reload or Back doesn't open it again; closing
 * the modal leaves the visitor on home. Anyone already signed in just goes where they were heading.
 */
export function AuthModalOpener({ modal, returnTo }: { modal: AuthModal; returnTo?: string }) {
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const opened = useRef(false);

  useEffect(() => {
    if (!isLoaded || opened.current) return;
    opened.current = true;

    const target = safeReturnUrl(returnTo, window.location.origin);
    if (isSignedIn) {
      router.replace(target ?? '/');
      return;
    }
    if (modal === 'sign-in') {
      clerk.openSignIn(
        target ? { forceRedirectUrl: target, signUpForceRedirectUrl: target } : undefined,
      );
    } else {
      clerk.openSignUp(
        target ? { forceRedirectUrl: target, signInForceRedirectUrl: target } : undefined,
      );
    }
    router.replace('/', { scroll: false });
  }, [clerk, isLoaded, isSignedIn, modal, returnTo, router]);

  return null;
}
