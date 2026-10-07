import { describe, expect, it } from 'vitest';
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';
import { clerkAuth } from './clerk.ts';

const options = { secretKey: 'sk_test_x', authorizedParties: ['http://localhost:3000'] };

/** clerkAuth with Clerk's verifyToken replaced by `fake`. */
const authWith = (fake: (token: string, opts: unknown) => Promise<unknown>) =>
  clerkAuth(options, fake as never);

const rejectWith =
  (reason: string, message = 'bad') =>
  async () => {
    throw new TokenVerificationError({ reason, message });
  };

describe('clerkAuth', () => {
  it('returns the identity from a valid token', async () => {
    const calls: unknown[][] = [];
    const auth = authWith(async (...args) => {
      calls.push(args);
      return { sub: 'user_1', email: 'a@x.test' };
    });

    await expect(auth.verify('tok')).resolves.toEqual({ providerId: 'user_1', email: 'a@x.test' });
    expect(calls).toEqual([['tok', options]]);
  });

  it.each([
    TokenVerificationErrorReason.TokenExpired,
    TokenVerificationErrorReason.TokenInvalidSignature,
    TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
  ])('treats %s as not signed in', async (reason) => {
    await expect(authWith(rejectWith(reason)).verify('tok')).resolves.toBeNull();
  });

  it('surfaces configuration and outage errors', async () => {
    const auth = authWith(rejectWith(TokenVerificationErrorReason.RemoteJWKFailedToLoad, 'down'));
    await expect(auth.verify('tok')).rejects.toThrow('down');
  });

  it('explains how to fix a missing email claim', async () => {
    const auth = authWith(async () => ({ sub: 'user_1' }));
    await expect(auth.verify('tok')).rejects.toThrow(/Customize session token/);
  });
});
