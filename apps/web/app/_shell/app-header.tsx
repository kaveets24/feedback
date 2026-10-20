import { Show, SignOutButton } from '@clerk/nextjs';
import Link from 'next/link';
import { NavLinks } from './nav-links';

/** The bar at the top of every page: the wordmark, the main sections, and the account. */
export function AppHeader() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-14 max-w-3xl items-stretch gap-4 px-4">
        <Link
          href="/"
          className="focus-glow flex items-center rounded-sm font-lcd text-lg text-lcd-ink"
        >
          Feedback
        </Link>
        <Show when="signed-in">
          <NavLinks />
          <div className="ml-auto flex items-center">
            <SignOutButton>
              <button type="button" className="link text-sm text-muted">
                Sign out
              </button>
            </SignOutButton>
          </div>
        </Show>
        <Show when="signed-out">
          <div className="ml-auto flex items-center">
            <Link href="/sign-in" className="link text-sm">
              Sign in
            </Link>
          </div>
        </Show>
      </div>
    </header>
  );
}
