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
      <h1 className="text-3xl font-semibold text-balance">Your profile</h1>
      <p className="mt-2 mb-6 max-w-[65ch] text-muted">
        Only you can see this page. Other people see your name and picture, and only next to your
        comments.
      </p>
      <AvatarControl avatar={profile.avatar} pending={profile.avatarUpload} />
      <div className="mt-8">
        <ProfileForm profile={profile} />
      </div>
    </main>
  );
}
