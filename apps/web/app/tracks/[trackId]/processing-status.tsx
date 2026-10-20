'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { useVersionStatus } from '../../../lib/use-version-status';
import { getVersionAction } from './actions';

/**
 * Shown while the newest version processes. Once it's ready or failed, refreshes the page so the
 * server renders the result.
 */
export function ProcessingStatus({
  versionId,
  versionNumber,
}: {
  versionId: string;
  versionNumber: number;
}) {
  const router = useRouter();
  const fetchStatus = useCallback(async () => {
    const result = await getVersionAction(versionId);
    return result.ok ? result.data.status : null;
  }, [versionId]);
  const status = useVersionStatus('processing', fetchStatus);

  useEffect(() => {
    if (status !== 'processing') router.refresh();
  }, [status, router]);

  return (
    <p role="status" className="text-sm text-muted">
      {status === 'processing'
        ? `Processing v${versionNumber}. This usually takes under a minute; this page updates on its own.`
        : 'Done processing. Loading…'}
    </p>
  );
}
