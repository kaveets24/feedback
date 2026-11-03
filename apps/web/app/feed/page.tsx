import { auth } from '@clerk/nextjs/server';
import type { Metadata } from 'next';
import { HomeFeed } from './home-feed';

export const metadata: Metadata = { title: 'Feed · Feedback' };

/** New public work by the people you follow. Accounts not yet approved are sent home. */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { isAuthenticated, redirectToSignIn } = await auth();
  if (!isAuthenticated) return redirectToSignIn();
  return <HomeFeed cursor={(await searchParams).cursor} />;
}
