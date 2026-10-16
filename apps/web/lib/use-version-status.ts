'use client';

import { useEffect, useState } from 'react';
import type { VersionStatus } from '@feedback/shared';

/** Waits between checks: quick at first (most uploads finish in seconds), then backing off. */
export function pollDelayMs(attempt: number): number {
  return Math.min(2000 * 1.5 ** attempt, 10_000);
}

/**
 * A version's status, kept current by polling `fetchStatus` while it's `processing`. Polling
 * stops once it's `ready` or `failed`, or the component unmounts. A failed check is retried on
 * the same schedule.
 */
export function useVersionStatus(
  initial: VersionStatus,
  fetchStatus: () => Promise<VersionStatus | null>,
): VersionStatus {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    if (status !== 'processing') return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = (attempt: number) => {
      timer = setTimeout(async () => {
        const next = await fetchStatus().catch(() => null);
        if (cancelled) return;
        if (next && next !== 'processing') setStatus(next);
        else check(attempt + 1);
      }, pollDelayMs(attempt));
    };
    check(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, fetchStatus]);

  return status;
}
