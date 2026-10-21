import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import type { CoverImage } from '@feedback/shared';
import { getMe, serverApi } from '../../lib/api';
import { Avatar } from './avatar';
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

/** The user's profile picture; none if the API can't say, since the icon stands in for it. */
async function ownAvatar(): Promise<CoverImage | null> {
  try {
    return (await serverApi().getProfile()).avatar;
  } catch {
    return null;
  }
}

/** The bar at the top of every page: the wordmark, the main sections, and the account. */
export async function AppHeader() {
  const { isAuthenticated } = await auth();
  const showNav = isAuthenticated && (await canUseApp());
  const [unread, avatar] = showNav ? await Promise.all([unreadCount(), ownAvatar()]) : [0, null];

  return (
    <header className="border-b border-rule">
      {/* Wraps on phones, where the nav drops to a second row (see NavLinks). */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-stretch gap-x-3 px-4 sm:flex-nowrap sm:gap-x-4">
        <Link
          href="/"
          className="focus-glow flex h-14 items-center rounded-sm font-lcd text-lg text-lcd-ink"
        >
          Feedback
        </Link>
        {showNav && <NavLinks />}
        <div className="ml-auto flex h-14 items-center gap-3 sm:gap-4">
          {showNav && (
            <>
              {/* Icons, not words: the bell, and your picture (or the person until you have one). */}
              <Link
                href="/notifications"
                className="focus-glow inline-flex items-center self-stretch rounded-sm text-sm text-muted hover:text-accent sm:px-1"
                aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                title="Notifications"
              >
                <BellIcon />
                {unread > 0 && (
                  // Phones have room for one digit, so the count stops at 9+ there.
                  <span className="ml-1 font-lcd text-accent tabular-nums">
                    <span className="sm:hidden">{unread > 9 ? '9+' : unread}</span>
                    <span className="hidden sm:inline">{unread > 99 ? '99+' : unread}</span>
                  </span>
                )}
              </Link>
              <Link
                href="/settings/profile"
                className="group focus-glow inline-flex items-center self-stretch rounded-sm text-muted hover:text-accent sm:px-1"
                aria-label="Profile"
                title="Profile"
              >
                {avatar ? (
                  <Avatar avatar={avatar} size="header" className="group-hover:border-accent" />
                ) : (
                  <PersonIcon />
                )}
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
