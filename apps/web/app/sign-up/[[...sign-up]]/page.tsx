import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { authModalHref, wantsAuthModal } from '../../../lib/auth-return';

/**
 * Signing up is a modal over home, so a visit here becomes that. Clerk's own steps still use the
 * real page.
 */
export default async function SignUpPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'sign-up'?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { 'sign-up': path } = await params;
  const query = await searchParams;
  if (wantsAuthModal(path, query)) redirect(authModalHref('sign-up', query.redirect_url));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SignUp />
    </main>
  );
}
