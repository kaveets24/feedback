/**
 * Boundary to the error-reporting vendor (Sentry today), like `AuthPort` for auth. The error
 * handler reports through this, so tests can check what gets reported without a vendor SDK.
 */
export interface ErrorReporter {
  /** Reports an unexpected error. Must not throw. */
  report(error: unknown): void;
}

/** Reports nothing: used when no DSN is configured, and in tests by default. */
export const noopErrorReporter: ErrorReporter = { report() {} };
