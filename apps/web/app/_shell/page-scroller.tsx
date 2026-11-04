'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

/** The app has one of these, so its parts find it by id. */
const SCROLLER_ID = 'page-scroller';

/** Where each URL was last scrolled to this session, for back and forward. */
const positions = new Map<string, number>();

/** One spelling of a URL, since hooks and window.location can encode a query differently. */
function urlKey(pathname: string, search: string): string {
  return `${pathname}?${new URLSearchParams(search).toString()}`;
}

/**
 * The parts of a document's scrolling that an inner scroller doesn't get from the browser: back
 * and forward return to where you were, and keys like Page Down and Space work before anything has
 * been clicked (they go to the focused element's scroller, so nothing focused scrolls nothing).
 */
function ScrollMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const url = urlKey(pathname, search);
  const shown = useRef(url);
  const restoring = useRef(false);

  useEffect(() => {
    // Next's listener for this event runs first and React may commit its update before this one
    // runs (it does when the page is cached), so the new page may or may not be showing yet. A pop
    // that only changes the hash (the listen page's token) lands in the first case and changes nothing.
    const onPopState = () => {
      const target = urlKey(window.location.pathname, window.location.search);
      const element = document.getElementById(SCROLLER_ID);
      if (target !== shown.current) restoring.current = true;
      else if (element) element.scrollTop = positions.get(target) ?? 0;
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useLayoutEffect(() => {
    const element = document.getElementById(SCROLLER_ID);
    if (!element) return;

    shown.current = url;
    if (restoring.current) element.scrollTop = positions.get(url) ?? 0;
    restoring.current = false;
    if (document.activeElement === document.body) element.focus({ preventScroll: true });

    const save = () => positions.set(url, element.scrollTop);
    element.addEventListener('scroll', save, { passive: true });
    return () => element.removeEventListener('scroll', save);
  }, [url]);

  return null;
}

/**
 * The app's scrolling region: everything above the mini-player. The document itself never scrolls,
 * so iOS Safari's toolbar stays put and can't leave the player floating (see the root layout).
 *
 * The scroll margin on direct children keeps Next's own scroll handling correct. On navigation it
 * calls scrollIntoView() on the new page's root element, which alone would stop with the header
 * just out of view; a margin taller than the header makes it stop at the very top instead.
 */
export function PageScroller({ children }: { children: ReactNode }) {
  return (
    <div
      id={SCROLLER_ID}
      tabIndex={-1}
      className="min-h-0 overflow-y-auto overscroll-contain outline-none [&>*]:scroll-mt-[100vh]"
    >
      {children}
      {/* useSearchParams needs a boundary, and this has no fallback worth showing. */}
      <Suspense fallback={null}>
        <ScrollMemory />
      </Suspense>
    </div>
  );
}
