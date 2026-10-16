import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

const required = {
  DATABASE_URL: 'postgres://feedback:feedback@localhost:5432/feedback',
  CLERK_SECRET_KEY: 'sk_test_abc',
  REDIS_URL: 'redis://localhost:6379',
};

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv(required)).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
    });
  });

  it('leaves monitoring off unless configured', () => {
    const env = loadEnv(required);
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.MONITORING_TEST_ERRORS).toBe(false);
  });

  it('parses monitoring settings', () => {
    const env = loadEnv({
      ...required,
      SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/2',
      MONITORING_TEST_ERRORS: 'true',
    });
    expect(env.SENTRY_DSN).toBe('https://abc@o1.ingest.sentry.io/2');
    expect(env.MONITORING_TEST_ERRORS).toBe(true);
    expect(() => loadEnv({ ...required, SENTRY_DSN: 'not a url' })).toThrow(/SENTRY_DSN/);
    expect(() => loadEnv({ ...required, MONITORING_TEST_ERRORS: 'yes please' })).toThrow(
      /MONITORING_TEST_ERRORS/,
    );
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ ...required, API_PORT: 'not-a-port' })).toThrow(
      /Invalid environment variables/,
    );
  });

  it('requires the database URL, Clerk secret key, and Redis URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL[\s\S]*CLERK_SECRET_KEY[\s\S]*REDIS_URL/);
    expect(() => loadEnv({ ...required, CLERK_SECRET_KEY: 'pk_test_abc' })).toThrow(
      /Clerk secret key/,
    );
  });

  it('accepts redis and rediss URLs only', () => {
    const url = 'redis://default:pw@feedback-staging-redis.internal:6379?family=6';
    expect(loadEnv({ ...required, REDIS_URL: url }).REDIS_URL).toBe(url);
    expect(loadEnv({ ...required, REDIS_URL: 'rediss://h:6380' }).REDIS_URL).toBe(
      'rediss://h:6380',
    );
    expect(() => loadEnv({ ...required, REDIS_URL: 'http://h:6379' })).toThrow(/REDIS_URL/);
  });
});
