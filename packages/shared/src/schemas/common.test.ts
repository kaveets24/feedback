import { describe, expect, it } from 'vitest';
import { errorResponseSchema } from './common.ts';

describe('errorResponseSchema', () => {
  it('accepts the documented error shape', () => {
    const parsed = errorResponseSchema.parse({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    expect(parsed.error.code).toBe('NOT_FOUND');
  });

  it('rejects a bare message', () => {
    expect(errorResponseSchema.safeParse({ message: 'nope' }).success).toBe(false);
  });
});
