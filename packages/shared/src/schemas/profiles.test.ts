import { describe, expect, it } from 'vitest';
import { CITIES, CITY_REGIONS, handleSchema, RESERVED_HANDLES } from './profiles.ts';

describe('CITY_REGIONS', () => {
  it('lists every city exactly once', () => {
    const grouped = CITY_REGIONS.flatMap((region) => region.cities);
    expect([...grouped].sort()).toEqual([...CITIES].sort());
  });

  it('keeps each region alphabetical', () => {
    for (const { cities } of CITY_REGIONS) {
      expect(cities).toEqual([...cities].sort());
    }
  });
});

describe('handleSchema', () => {
  it.each([
    ['night_owl', 'night_owl'],
    ['  Night_Owl ', 'night_owl'],
    ['abc', 'abc'],
    ['a1234567890123456789', 'a1234567890123456789'],
    ['___', '___'],
  ])('accepts %j as %j', (input, handle) => {
    expect(handleSchema.parse(input)).toBe(handle);
  });

  it.each([
    'ab',
    'a12345678901234567890',
    'night-owl',
    'night.owl',
    'night owl',
    '@nightowl',
    'émile',
    '',
  ])('rejects %j', (input) => {
    expect(handleSchema.safeParse(input).success).toBe(false);
  });

  it('rejects reserved words in any case', () => {
    expect(handleSchema.safeParse('settings').success).toBe(false);
    expect(handleSchema.safeParse('Admin').success).toBe(false);
    for (const word of RESERVED_HANDLES) expect(handleSchema.safeParse(word).success).toBe(false);
  });
});
