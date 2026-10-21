import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { getMe, serverApi } from '../../lib/api';
import { BellIcon, PersonIcon } from './icons';
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

/** How many notifications are unread; none if the API can't say, since it only decorates a link. */
async function unreadCount(): Promise<number> {
  try {
    return (await serverApi().getUnreadCount()).count;
  } catch {
    return 0;
  }
}

/** The bar at the top of every page: the wordmark, the main sections, and the account. */
export async function AppHeader() {
  const { isAuthenticated } = await auth();
  const showNav = isAuthenticated && (await canUseApp());
  const unread = showNav ? await unreadCount() : 0;

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex h-14 max-w-3xl items-stretch gap-3 px-4 sm:gap-4">
        <Link
          href="/"
          className="focus-glow flex items-center rounded-sm font-lcd text-lg text-lcd-ink"
        >
          Feedback
        </Link>
        {showNav && <NavLinks />}
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {showNav && (
            <>
              {/* On phones, where the header has no room for words, these two are icons. */}
              <Link
                href="/notifications"
                className="link inline-flex items-center self-stretch text-sm text-muted max-sm:no-underline"
                aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
              >
                <span className="sm:hidden">
                  <BellIcon />
                </span>
                <span className="hidden sm:inline">Notifications</span>
                {unread > 0 && (
                  <span className="ml-1 font-lcd text-accent tabular-nums sm:ml-1.5">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </Link>
              <Link
                href="/settings/profile"
                className="link inline-flex items-center self-stretch text-sm text-muted max-sm:no-underline"
                aria-label="Profile"
              >
                <span className="sm:hidden">
                  <PersonIcon />
                </span>
                <span className="hidden sm:inline">Profile</span>
              </Link>
            </>
          )}
          {isAuthenticated ? (
            // On phones an approved account signs out from the profile page instead.
            <SignOutButton>
              <button
                type="button"
                className={`link text-sm text-muted ${showNav ? 'max-sm:hidden' : ''}`}
              >
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
