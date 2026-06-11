import { describe, it, expect } from 'vitest';
import { splitParagraphSegments } from './textSegmentation';

describe('splitParagraphSegments', () => {
  it('returns no segments and the whole buffer as remainder when there is no paragraph break', () => {
    const { segments, remainder } = splitParagraphSegments('a single line with no breaks');
    expect(segments).toEqual([]);
    expect(remainder).toBe('a single line with no breaks');
  });

  it('flushes one completed paragraph and keeps the trailing partial as remainder', () => {
    const { segments, remainder } = splitParagraphSegments('First para.\n\nSecond para in progress');
    expect(segments).toEqual(['First para.\n\n']);
    expect(remainder).toBe('Second para in progress');
  });

  it('flushes multiple completed paragraphs', () => {
    const { segments, remainder } = splitParagraphSegments('One.\n\nTwo.\n\nThree (partial)');
    expect(segments).toEqual(['One.\n\n', 'Two.\n\n']);
    expect(remainder).toBe('Three (partial)');
  });

  it('preserves multi-newline delimiters (\\n\\n\\n)', () => {
    const { segments, remainder } = splitParagraphSegments('Para.\n\n\n\nNext');
    expect(segments).toEqual(['Para.\n\n\n\n']);
    expect(remainder).toBe('Next');
  });

  it('does not split a markdown table that has no blank line inside it', () => {
    // A table is a single paragraph: its rows are separated by single newlines,
    // so it must stay intact in the remainder until a blank line follows.
    const table = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';
    const { segments, remainder } = splitParagraphSegments(table);
    expect(segments).toEqual([]);
    expect(remainder).toBe(table);
  });

  it('keeps a completed table as one segment and buffers what follows', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    const { segments, remainder } = splitParagraphSegments(`${table}\n\nAfter table`);
    expect(segments).toEqual([`${table}\n\n`]);
    expect(remainder).toBe('After table');
  });

  it('does not split a code fence that spans the buffer without a blank line', () => {
    const fence = '```js\nconst x = 1;\nconst y = 2;\n```';
    const { segments, remainder } = splitParagraphSegments(fence);
    expect(segments).toEqual([]);
    expect(remainder).toBe(fence);
  });

  it('reassembles to the original buffer (segments joined + remainder)', () => {
    const buffer = 'Alpha.\n\nBeta.\n\nGamma still going';
    const { segments, remainder } = splitParagraphSegments(buffer);
    expect(segments.join('') + remainder).toBe(buffer);
  });

  it('ignores whitespace-only segments', () => {
    const { segments, remainder } = splitParagraphSegments('   \n\nreal content');
    expect(segments).toEqual([]);
    expect(remainder).toBe('real content');
  });
});
