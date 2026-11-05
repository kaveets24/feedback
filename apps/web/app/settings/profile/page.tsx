import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { serverApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { AvatarControl } from './avatar-control';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Your profile · Feedback' };

/** The signed-in user's own profile. Only they see this page. */
export default async function ProfilePage() {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const profile = await loadOrNotFound(() => serverApi().getProfile());

  return (
    <main className="mx-auto max-w-3xl px-4 pt-6 pb-16">
      <h1 className="mb-6 text-3xl font-semibold text-balance">Your profile</h1>
      <AvatarControl avatar={profile.avatar} pending={profile.avatarUpload} />
      <div className="mt-8">
        <ProfileForm profile={profile} />
      </div>
      {/* The one Sign out for approved accounts: the header only shows it to the others. */}
      <div className="mt-12 border-t border-rule pt-6">
        <SignOutButton>
          <button type="button" className="btn">
            Sign out
          </button>
        </SignOutButton>
      </div>
    </main>
  );
}
