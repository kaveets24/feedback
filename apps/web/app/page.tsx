import { SignOutButton } from '@clerk/nextjs';
import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import { serverApi } from '../lib/api';

export default async function HomePage() {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main>
        <h1>Feedback</h1>
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

  if (me.accessStatus === 'pending') {
    return (
      <main>
        <h1>You&apos;re on the list</h1>
        <p>
          Feedback is invite-only for now. Your account ({me.email}) is waiting for approval.
          We&apos;ll let you in as soon as it&apos;s approved; check back here.
        </p>
        <SignOutButton />
      </main>
    );
  }

  if (me.accessStatus === 'rejected') {
    return (
      <main>
        <h1>Account not approved</h1>
        <p>Your account ({me.email}) wasn&apos;t approved for access.</p>
        <SignOutButton />
      </main>
    );
  }

  return (
    <main>
      <h1>Feedback</h1>
      <p>Signed in as {me.email}</p>
      <SignOutButton />
    </main>
  );
}
