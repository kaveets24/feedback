/** A run of items from one calendar day, with the words to head it. */
export interface Day<T> {
  /** The date as YYYY-MM-DD, in the time zone asked for. */
  key: string;
  /** "Today", "Yesterday", "November 3", or "November 3, 2025" before this year. */
  label: string;
  items: T[];
}

/** The calendar date of a moment in a time zone, as YYYY-MM-DD. */
function dateIn(moment: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(moment);
  const part = (type: 'year' | 'month' | 'day') => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The date before a YYYY-MM-DD one. Calendar arithmetic, so daylight saving can't skew it. */
function dayBefore(date: string): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function labelFor(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === dayBefore(today)) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    ...(date.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
  }).format(new Date(`${date}T12:00:00Z`));
}

/**
 * Splits a list into days, keeping its order. Items next to each other on the same date share a
 * day, so a newest-first list gives its days newest first.
 */
export function groupByDay<T extends { createdAt: string }>(
  items: readonly T[],
  now: Date,
  timeZone: string,
): Day<T>[] {
  const today = dateIn(now, timeZone);
  const days: Day<T>[] = [];
  for (const item of items) {
    const key = dateIn(new Date(item.createdAt), timeZone);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(item);
    else days.push({ key, label: labelFor(key, today), items: [item] });
  }
  return days;
}
