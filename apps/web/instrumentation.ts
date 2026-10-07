// Runs once when the server starts: validate env so a bad config fails fast.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/env');
}
