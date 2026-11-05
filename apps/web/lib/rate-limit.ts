import {
  ApiError,
  CLIENT_IP_HEADER,
  errorResponseSchema,
  WEB_SECRET_HEADER,
} from '@feedback/shared';
import { RATE_LIMITED_DIGEST } from './rate-limited-digest';

/**
 * The API said to slow down. It's still an ApiError, so a server action shows its message; while
 * rendering a page, the digest tells the error page what happened.
 */
export class RateLimitedError extends ApiError {
  readonly digest = RATE_LIMITED_DIGEST;

  constructor(message: string) {
    super(429, 'RATE_LIMITED', message);
  }
}

/** `fetch` for the API client, turning a 429 into a `RateLimitedError`. */
export const rateLimitedFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  if (res.status !== 429) return res;
  const body = errorResponseSchema.safeParse(await res.json().catch(() => null));
  throw new RateLimitedError(
    body.data?.error.message ?? 'Too many requests. Try again in a minute.',
  );
};

/**
 * The headers that tell the API who a request is really for. The API sees the web app's servers
 * as the caller, so it needs the visitor's address to limit signed-out visitors one by one, and
 * the secret is why it can believe us. Vercel sets these request headers itself, overwriting
 * whatever the browser sent. Nothing to send without a secret, or without an address.
 */
export function forwardedClientHeaders(
  request: Pick<Headers, 'get'>,
  secret: string | undefined,
): Record<string, string> {
  if (!secret) return {};
  const ip = request.get('x-real-ip') ?? request.get('x-forwarded-for')?.split(',')[0]?.trim();
  return ip ? { [WEB_SECRET_HEADER]: secret, [CLIENT_IP_HEADER]: ip } : {};
}
