import { describe, expect, it } from 'vitest';
import { groupByDay } from './notification-days';

const at = (createdAt: string) => ({ createdAt });
const summary = (days: ReturnType<typeof groupByDay>) =>
  days.map((day) => [day.label, day.items.length]);

describe('groupByDay', () => {
  const now = new Date('2026-11-05T15:00:00Z');

  it('gives no days for an empty list', () => {
    expect(groupByDay([], now, 'UTC')).toEqual([]);
  });

  it('heads days Today, Yesterday, then by date, keeping the order', () => {
    const days = groupByDay(
      [
        at('2026-11-05T14:00:00Z'),
        at('2026-11-05T01:00:00Z'),
        at('2026-11-04T09:00:00Z'),
        at('2026-11-03T09:00:00Z'),
        at('2026-10-30T09:00:00Z'),
      ],
      now,
      'UTC',
    );
    expect(summary(days)).toEqual([
      ['Today', 2],
      ['Yesterday', 1],
      ['November 3', 1],
      ['October 30', 1],
    ]);
    expect(days[0]?.key).toBe('2026-11-05');
  });

  it('adds the year before this one', () => {
    expect(groupByDay([at('2025-11-03T09:00:00Z')], now, 'UTC')[0]?.label).toBe('November 3, 2025');
  });

  it('knows yesterday across a month and a year', () => {
    expect(
      groupByDay([at('2026-10-31T09:00:00Z')], new Date('2026-11-01T09:00:00Z'), 'UTC')[0]?.label,
    ).toBe('Yesterday');
    expect(
      groupByDay([at('2025-12-31T09:00:00Z')], new Date('2026-01-01T09:00:00Z'), 'UTC')[0]?.label,
    ).toBe('Yesterday');
  });

  it("uses the viewer's time zone for the day", () => {
    // 5pm on November 4 in Chicago, viewed at 8:30pm the same evening.
    const evening = new Date('2026-11-05T02:30:00Z');
    const comment = at('2026-11-04T23:00:00Z');
    expect(groupByDay([comment], evening, 'America/Chicago')[0]?.label).toBe('Today');
    expect(groupByDay([comment], evening, 'UTC')[0]?.label).toBe('Yesterday');
  });

  it('knows yesterday across a clock change', () => {
    // US clocks went back on November 1, 2026, so that day ran 25 hours in Chicago.
    const days = groupByDay(
      [at('2026-11-01T17:00:00Z')],
      new Date('2026-11-02T17:00:00Z'),
      'America/Chicago',
    );
    expect(days[0]?.label).toBe('Yesterday');
  });
});
