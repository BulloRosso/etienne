import { describe, it, expect } from 'vitest';
import { extractRelativePath, formatTime } from './paths';

describe('extractRelativePath', () => {
  it('strips workspace + project segments from a Windows absolute path', () => {
    const abs = 'C:\\Data\\GitHub\\claude-multitenant\\workspace\\pet-store-4\\out\\vogel-angebote.html';
    expect(extractRelativePath(abs)).toBe('out/vogel-angebote.html');
  });

  it('strips workspace + project segments from a POSIX absolute path', () => {
    const abs = '/data/workspace/my-project/wiki/index.md';
    expect(extractRelativePath(abs)).toBe('wiki/index.md');
  });

  it('returns an already-relative path unchanged', () => {
    expect(extractRelativePath('out/report.pdf')).toBe('out/report.pdf');
  });

  it('returns the input when there is no workspace segment', () => {
    expect(extractRelativePath('/etc/hosts')).toBe('/etc/hosts');
  });
});

describe('formatTime', () => {
  it('produces a zero-padded HH:MM string', () => {
    expect(formatTime()).toMatch(/^\d{2}:\d{2}$/);
  });
});
