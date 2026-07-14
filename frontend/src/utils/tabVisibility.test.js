import { describe, it, expect } from 'vitest';
import { reconcileVisiblePaths } from './tabVisibility';

const MAX = 6;

describe('reconcileVisiblePaths', () => {
  it('shows every file when multiple files are added in a single update', () => {
    // Regression: batched setFiles calls (e.g. tab restore) used to promote
    // only the first new file, leaving the rest open but invisible.
    const { visible, newPaths } = reconcileVisiblePaths([], ['a.md', 'b.md', 'c.md'], [], MAX);
    expect(visible).toEqual(['a.md', 'b.md', 'c.md']);
    expect(newPaths).toEqual(['a.md', 'b.md', 'c.md']);
  });

  it('prepends a newly opened file and keeps existing visible tabs', () => {
    const { visible, newPaths } = reconcileVisiblePaths(
      ['a.md', 'b.md'],
      ['a.md', 'b.md', 'c.md'],
      ['b.md', 'a.md'],
      MAX
    );
    expect(visible).toEqual(['c.md', 'b.md', 'a.md']);
    expect(newPaths).toEqual(['c.md']);
  });

  it('drops closed files and promotes an overflow file into the free slot', () => {
    const curr = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const { visible } = reconcileVisiblePaths(
      ['x', ...curr],
      curr,
      ['x', 'a', 'b', 'c', 'd', 'e'],
      MAX
    );
    // 'x' was closed; 'f' (first non-visible open file) fills the slot.
    expect(visible).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('preserves visible tab order when files reorder or shift indices', () => {
    const { visible } = reconcileVisiblePaths(
      ['a', 'b', 'c'],
      ['c', 'a', 'b'],
      ['b', 'a', 'c'],
      MAX
    );
    expect(visible).toEqual(['b', 'a', 'c']);
  });

  it('caps the strip at maxVisible, overflow keeps the remaining files', () => {
    const curr = ['n1', 'n2', 'a', 'b', 'c', 'd', 'e', 'f'];
    const { visible } = reconcileVisiblePaths(
      ['a', 'b', 'c', 'd', 'e', 'f'],
      curr,
      ['a', 'b', 'c', 'd', 'e', 'f'],
      MAX
    );
    expect(visible).toEqual(['n1', 'n2', 'a', 'b', 'c', 'd']);
  });

  it('discards stale visible paths that are no longer open', () => {
    // e.g. persisted sessionStorage state referencing files from a previous session
    const { visible } = reconcileVisiblePaths([], ['a.md'], ['gone.md', 'a.md'], MAX);
    expect(visible).toEqual(['a.md']);
  });
});
