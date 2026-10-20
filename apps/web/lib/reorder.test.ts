import { describe, expect, it } from 'vitest';
import { dragStep, moveItem } from './reorder';

describe('moveItem', () => {
  it('moves an item down, up, or nowhere', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
  });

  it('clamps the target and leaves the input alone', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 10)).toEqual(['b', 'c', 'a']);
    expect(moveItem(list, 2, -1)).toEqual(['c', 'a', 'b']);
    expect(moveItem(list, 5, 0)).toEqual(['a', 'b', 'c']);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('dragStep', () => {
  it('swaps once the row passes half its neighbour', () => {
    expect(dragStep(-25, 48, 48)).toBe(-1);
    expect(dragStep(-24, 48, 48)).toBe(0);
    expect(dragStep(25, 48, 48)).toBe(1);
    expect(dragStep(10, 48, 48)).toBe(0);
  });

  it('never swaps past either end', () => {
    expect(dragStep(-100, undefined, 48)).toBe(0);
    expect(dragStep(100, 48, undefined)).toBe(0);
  });
});
