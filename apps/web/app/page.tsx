import { auth } from '@clerk/nextjs/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getMe } from '../lib/api';
import { HomeFeed } from './home-feed';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated } = await auth();

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-3xl px-4 pt-16 pb-16">
        {/* The wordmark already says "Feedback" right above, so the name is for screen readers
            and the pitch leads. */}
        <h1 className="sr-only">Feedback</h1>
        <p className="max-w-[24ch] text-3xl font-semibold text-balance">
          Share rough song ideas, control who hears them, and collect feedback pinned to the moment.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/sign-in" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/sign-up" className="btn">
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  const me = await getMe();

  if (me.accessStatus === 'pending') {
    return (
      <Message title="You’re on the list">
        <p>
          Feedback is invite-only for now. Your account (
          <span className="font-medium text-ink">{me.email}</span>) is waiting for approval. We’ll
          let you in as soon as it’s approved; check back here.
        </p>
      </Message>
    );
  }

  if (me.accessStatus === 'rejected') {
    return (
      <Message title="Account not approved">
        <p>
          Your account (<span className="font-medium text-ink">{me.email}</span>) wasn’t approved
          for access.
        </p>
      </Message>
    );
  }

  return <HomeFeed cursor={(await searchParams).cursor} />;
}

/** A screen with one thing to say: the waiting-list and not-approved notices. */
function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-16 pb-16">
      <h1 className="text-3xl font-semibold text-balance">{title}</h1>
      <div className="mt-3 max-w-[60ch] text-muted">{children}</div>
    </main>
  );
}
