/**
 * The digest on a rate limit error. Next gives error pages only an error's digest, and keeps one
 * that's already set, so this is how the error page knows to say "slow down". In its own file so
 * the error page, which runs in the browser, doesn't pull in the API client.
 */
export const RATE_LIMITED_DIGEST = 'RATE_LIMITED';
