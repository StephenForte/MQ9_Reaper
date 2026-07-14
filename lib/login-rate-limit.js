/**
 * Simple in-memory login rate limiter (per key / IP).
 * Enough for single-instance v1; resets on process restart.
 */

/**
 * @param {{ limit?: number, windowMs?: number, now?: () => number }} [opts]
 */
export function createLoginRateLimiter(opts = {}) {
  const limit = opts.limit ?? 5;
  const windowMs = opts.windowMs ?? 60_000;
  const nowFn = opts.now ?? Date.now;

  /** @type {Map<string, number[]>} */
  const hits = new Map();

  /**
   * @param {string} key
   * @returns {{ ok: true } | { ok: false, retryAfterSec: number }}
   */
  function check(key) {
    const now = nowFn();
    const prior = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (prior.length >= limit) {
      hits.set(key, prior);
      const retryAfterSec = Math.max(
        1,
        Math.ceil((prior[0] + windowMs - now) / 1000)
      );
      return { ok: false, retryAfterSec };
    }
    prior.push(now);
    hits.set(key, prior);
    return { ok: true };
  }

  function reset() {
    hits.clear();
  }

  return { check, reset, limit, windowMs };
}
