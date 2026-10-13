'use client';

import { useState } from 'react';

/** Throws while rendering in the browser, so error.tsx catches and reports it. */
export function BrowserErrorButton() {
  const [failed, setFailed] = useState(false);
  if (failed) throw new Error('Test error from the browser');

  return (
    <button type="button" onClick={() => setFailed(true)}>
      Throw a browser error
    </button>
  );
}
