import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getMe } from '../../lib/api';
import { NavLinks } from './nav-links';

/**
 * Whether to show the app's sections. Accounts waiting for approval (or not approved) can't use
 * them, so their header is just the wordmark and Sign out. If the API can't be reached, the nav
 * shows anyway: it gates nothing, and the pages handle the error.
 */
async function canUseApp(): Promise<boolean> {
  try {
    return (await getMe()).accessStatus === 'approved';
  } catch {
    return true;
  }
}

/** The bar at the top of every page: the wordmark, the main sections, and the account. */
export async function AppHeader() {
  const { isAuthenticated } = await auth();
  const showNav = isAuthenticated && (await canUseApp());

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-14 max-w-3xl items-stretch gap-4 px-4">
        <Link
          href="/"
          className="focus-glow flex items-center rounded-sm font-lcd text-lg text-lcd-ink"
        >
          Feedback
        </Link>
        {showNav && <NavLinks />}
        <div className="ml-auto flex items-center gap-4">
          {showNav && (
            <Link href="/settings/profile" className="link text-sm text-muted">
              Profile
            </Link>
          )}
          {isAuthenticated ? (
            <SignOutButton>
              <button type="button" className="link text-sm text-muted">
                Sign out
              </button>
            </SignOutButton>
          ) : (
            <Link href="/sign-in" className="link text-sm">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
