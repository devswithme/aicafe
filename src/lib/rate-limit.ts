/**
 * Lightweight in-memory sliding-window rate limiter to prevent per-user API abuse.
 *
 * Keyed by `${spaceId}:${clientIP}` so each visitor of each space is limited
 * independently. State is per-server-instance (sufficient for single-node / dev;
 * swap for Redis if you scale horizontally).
 */

/** Max requests allowed per window, per user (IP) per space. */
export const RATE_LIMIT_MAX = 30;
/** Sliding window length in milliseconds. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

// Periodically drop empty/stale buckets so the map can't grow unbounded.
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < RATE_LIMIT_WINDOW_MS) return;
  lastSweep = now;
  for (const [key, timestamps] of hits) {
    const fresh = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (fresh.length === 0) hits.delete(key);
    else hits.set(key, fresh);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
  limit: number;
};

export function checkRateLimit(
  spaceId: string,
  clientIP: string,
  max: number = RATE_LIMIT_MAX,
  windowMs: number = RATE_LIMIT_WINDOW_MS
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = `${spaceId}:${clientIP}`;
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= max) {
    const oldest = timestamps[0];
    const retryAfterSecs = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    hits.set(key, timestamps);
    return { allowed: false, remaining: 0, retryAfterSecs, limit: max };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return {
    allowed: true,
    remaining: max - timestamps.length,
    retryAfterSecs: 0,
    limit: max,
  };
}
