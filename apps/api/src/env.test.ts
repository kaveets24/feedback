import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

const required = {
  DATABASE_URL: 'postgres://feedback:feedback@localhost:5432/feedback',
  CLERK_SECRET_KEY: 'sk_test_abc',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(required)).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ ...required, API_PORT: 'not-a-port' })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('requires the database URL and Clerk secret key', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*CLERK_SECRET_KEY/);
    expect(() => loadEnv({ ...required, CLERK_SECRET_KEY: 'pk_test_abc' })).toThrow(
      /Clerk secret key/,
    );
  });
});
