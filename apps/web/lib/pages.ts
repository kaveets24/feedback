/**
 * Every item from a cursor-paged list, for pickers that need the whole set. Stops after
 * `maxPages` so a huge library can't stall a page render; the picker just shows what it got.
 */
export async function collectPages<T>(
  fetchPage: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
  maxPages = 10,
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    items.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return items;
}
