'use strict';

// server/utils/rateLimit.js
//
// ─────────────────────────────────────────────────────────────────────────────
// A minimal, dependency-free fixed-window rate limiter.
//
// WHY NOT A LIBRARY
//   The project has no rate-limiting dependency and the public certificate
//   verification endpoint is unauthenticated, so it is the obvious target for
//   enumeration and for a traffic amplifier. Rather than add a dependency
//   (which would also need `npm install` in every deployment), this is a small
//   self-contained limiter with the same fixed-window semantics.
//
// LIMITATIONS (documented, not hidden)
//   * The counters live in the PROCESS memory. A restart clears them, and a
//     multi-process deployment gives one window per process. A shared store
//     (Redis) would be required for a cluster — see the Chapter 5
//     recommendations.
//   * The window is fixed (not sliding): a caller can burst 2x `max` across a
//     window boundary. For abuse prevention this is acceptable; for exact
//     quota enforcement it is not.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a fixed-window limiter.
 *
 * @param {object} [options]
 * @param {number} [options.windowMs] length of the window (default 60 s)
 * @param {number} [options.max]      requests allowed per window (default 30)
 * @param {() => number} [options.now] clock (injectable for tests)
 */
function createRateLimiter({ windowMs = 60_000, max = 30, now = () => Date.now() } = {}) {
  const hits = new Map();

  // Periodic sweep so a long-running process does not accumulate one entry
  // per distinct client forever.
  const sweep = () => {
    const t = now();
    for (const [key, entry] of hits.entries()) {
      if (t >= entry.resetAt) hits.delete(key);
    }
  };
  const sweepTimer = setInterval(sweep, Math.max(1000, windowMs));
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

  return {
    /**
     * Record a request.
     * @param {string} key client identity (e.g. IP address)
     * @returns {{allowed:boolean, remaining:number, retryAfterSeconds:number, limit:number}}
     */
    check(key) {
      const t = now();
      const entry = hits.get(key);

      if (!entry || t >= entry.resetAt) {
        hits.set(key, { count: 1, resetAt: t + windowMs });
        return { allowed: true, remaining: max - 1, retryAfterSeconds: 0, limit: max };
      }

      entry.count += 1;
      const allowed = entry.count <= max;
      return {
        allowed,
        remaining: Math.max(0, max - entry.count),
        retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000),
        limit: max,
      };
    },

    /** Forget every counter. */
    reset() {
      hits.clear();
    },

    /** Number of tracked clients. */
    size() {
      return hits.size;
    },

    /** Release the sweep timer. */
    dispose() {
      clearInterval(sweepTimer);
      hits.clear();
    },
  };
}

/**
 * Derive a rate-limiting key from a request.
 * Uses the socket address; `req.ip` is only trusted when the app is behind a
 * proxy that sets it correctly.
 *
 * @param {object} req
 * @returns {string}
 */
function clientKey(req) {
  const ip =
    (req && req.ip) ||
    (req && req.socket && req.socket.remoteAddress) ||
    'unknown';
  return String(ip);
}

module.exports = { createRateLimiter, clientKey };
