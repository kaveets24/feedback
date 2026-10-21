import { describe, expect, it } from 'vitest';
import { CITIES, CITY_REGIONS } from './profiles.ts';

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
