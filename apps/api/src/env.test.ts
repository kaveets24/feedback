import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.ts';

describe('loadEnv', () => {
  it('applies defaults', () => {
    expect(loadEnv({})).toMatchObject({ NODE_ENV: 'development', API_PORT: 4000 });
  });

  it('fails fast on invalid values', () => {
    expect(() => loadEnv({ API_PORT: 'not-a-port' })).toThrow(/Invalid environment variables/);
  });
});
