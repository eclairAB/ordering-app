import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rate-limit.ts';

describe('createRateLimiter', () => {
  it('allows up to max per window, then blocks until the window resets', () => {
    const hit = createRateLimiter({ max: 2, windowMs: 1_000 });
    expect(hit('a', 0).allowed).toBe(true);
    expect(hit('a', 10).allowed).toBe(true);
    expect(hit('a', 20)).toEqual({ allowed: false, retryAfterS: 1 });
    expect(hit('b', 20).allowed).toBe(true);
    expect(hit('a', 1_000).allowed).toBe(true);
  });
});
