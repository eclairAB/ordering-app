import type { FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import { HttpError } from './errors.ts';

export interface RateLimitOptions {
  /** Requests allowed per window, per key. */
  max: number;
  windowMs: number;
  key?: (request: FastifyRequest) => string;
}

/**
 * Fixed-window, in-memory rate limiter. Good enough for one process on a shop LAN,
 * and avoids a dependency. Expired windows are swept lazily.
 */
export function createRateLimiter({ max, windowMs }: Omit<RateLimitOptions, 'key'>) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = 0;

  return function hit(key: string, now: number = Date.now()): { allowed: boolean; retryAfterS: number } {
    if (now >= nextSweep) {
      for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      nextSweep = now + windowMs;
    }
    let window = windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    window.count += 1;
    return {
      allowed: window.count <= max,
      retryAfterS: Math.ceil((window.resetAt - now) / 1000),
    };
  };
}

export function rateLimit(options: RateLimitOptions): onRequestAsyncHookHandler {
  const hit = createRateLimiter(options);
  const keyOf = options.key ?? ((request: FastifyRequest) => request.ip);
  return async (request, reply) => {
    const { allowed, retryAfterS } = hit(keyOf(request));
    if (!allowed) {
      reply.header('Retry-After', String(retryAfterS));
      throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait a moment.');
    }
  };
}
