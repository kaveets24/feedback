import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { serverApi } from '../lib/api';

export default async function HomePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Demo</h1>
        <p>
          Share rough song ideas, control who hears them, and collect feedback pinned to the moment.
        </p>
        <p>
          <Link href="/sign-in">Sign in</Link> or <Link href="/sign-up">create an account</Link>
        </p>
      </main>
    );
  }

  const me = await serverApi().getMe();

  return (
    <main>
      <h1>Demo</h1>
      <p>Signed in as {me.email}</p>
      <p>Access status: {me.accessStatus}</p>
      <SignOutButton />
    </main>
  );
}
