import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { authModalHref, wantsAuthModal } from '../../../lib/auth-return';

/**
 * Signing in is a modal over home, so a visit here (a bookmark, or a redirect from a page that needs
 * an account) becomes that. Clerk's own steps still use the real page.
 */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ 'sign-in'?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { 'sign-in': path } = await params;
  const query = await searchParams;
  if (wantsAuthModal(path, query)) redirect(authModalHref('sign-in', query.redirect_url));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <SignIn />
    </main>
  );
}
