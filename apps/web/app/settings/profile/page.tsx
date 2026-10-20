import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { serverApi } from '../../../lib/api';
import { loadOrNotFound } from '../../../lib/load';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = { title: 'Your profile · Feedback' };

/** The signed-in user's own profile. Only they see this page. */
export default async function ProfilePage() {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();

  const profile = await loadOrNotFound(() => serverApi().getProfile());

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <h1>Your profile</h1>
      <p>Only you can see this page. Other people see your name, and only next to your comments.</p>
      <ProfileForm profile={profile} />
    </main>
  );
}
