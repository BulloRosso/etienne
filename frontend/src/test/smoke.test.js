import { describe, it, expect } from 'vitest';

// Smoke test: confirms the Vitest harness is wired up correctly.
describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
