/** A copy of `list` with the item at `from` moved to index `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

/**
 * Which way a dragged row should swap with its neighbour, given how far it has been pulled from
 * its own slot (`offset`, negative is up) and the heights of the rows above and below it
 * (undefined at either end). Past half a neighbour's height, it swaps with that neighbour.
 */
export function dragStep(
  offset: number,
  above: number | undefined,
  below: number | undefined,
): -1 | 0 | 1 {
  if (above !== undefined && offset < -above / 2) return -1;
  if (below !== undefined && offset > below / 2) return 1;
  return 0;
}
