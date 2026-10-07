/** The identity an auth provider vouches for after verifying a session token. */
export interface AuthIdentity {
  providerId: string;
  email: string;
}

/**
 * Boundary to the auth provider (Clerk today). Everything provider-specific lives behind this,
 * so swapping providers means writing one new implementation.
 */
export interface AuthPort {
  /** Returns the identity for a valid token, or null if the token is invalid or expired. */
  verify(token: string): Promise<AuthIdentity | null>;
}
