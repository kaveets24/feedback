/** The two forms of Clerk's modal. */
export type AuthModal = 'sign-in' | 'sign-up';

/**
 * Where to go after signing in, as a path on this site, or undefined if `value` is missing or
 * points anywhere else. A return URL arrives in the address, so a crafted one mustn't be able to
 * send someone to another site once they've signed in.
 */
export function safeReturnUrl(value: string | undefined, origin: string): string | undefined {
  if (!value) return undefined;
  let url: URL;
  try {
    url = new URL(value, origin);
  } catch {
    return undefined;
  }
  return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : undefined;
}

/** Home with a modal asked for, which is what a visit to `/sign-in` or `/sign-up` becomes. */
export function authModalHref(modal: AuthModal, returnTo: unknown): string {
  const query = new URLSearchParams({ auth: modal });
  if (typeof returnTo === 'string') query.set('redirect_url', returnTo);
  return `/?${query}`;
}

/**
 * Whether a visit to `/sign-in` or `/sign-up` should become the modal: the bare path, without
 * Clerk's own `__clerk_*` params, since its callback and verification steps need the real page.
 */
export function wantsAuthModal(
  path: readonly string[] | undefined,
  query: Record<string, unknown>,
): boolean {
  return !path?.length && !Object.keys(query).some((key) => key.startsWith('__clerk'));
}
