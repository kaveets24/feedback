import { verifyToken } from '@clerk/backend';
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';
import type { AuthPort } from './port.ts';

// Problems with the token itself mean "not signed in". Anything else (bad secret key, JWKS fetch
// failure) is our misconfiguration or an outage, and should surface as a 500.
const tokenProblems = new Set<string>([
  TokenVerificationErrorReason.TokenExpired,
  TokenVerificationErrorReason.TokenInvalid,
  TokenVerificationErrorReason.TokenInvalidAlgorithm,
  TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
  TokenVerificationErrorReason.TokenInvalidSignature,
  TokenVerificationErrorReason.TokenNotActiveYet,
  TokenVerificationErrorReason.TokenIatInTheFuture,
  TokenVerificationErrorReason.TokenVerificationFailed,
  TokenVerificationErrorReason.JWKKidMismatch,
]);

export function clerkAuth(
  options: { secretKey: string; authorizedParties: string[] },
  verify: typeof verifyToken = verifyToken,
): AuthPort {
  return {
    async verify(token) {
      let payload;
      try {
        payload = await verify(token, options);
      } catch (err) {
        if (err instanceof TokenVerificationError && tokenProblems.has(err.reason)) return null;
        throw err;
      }

      const email: unknown = payload.email;
      if (typeof email !== 'string' || email === '') {
        throw new Error(
          'Clerk session token has no "email" claim. In the Clerk dashboard, go to Sessions → ' +
            'Customize session token and add { "email": "{{user.primary_email_address}}" }.',
        );
      }
      return { providerId: payload.sub, email };
    },
  };
}
