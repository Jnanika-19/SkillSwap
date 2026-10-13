'use strict';

// Small in-memory limiter suitable for this single-process student project.
// Use a shared store (for example Redis) when running multiple server instances.
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, message = 'Too many attempts. Please try again later.' } = {}) {
  const requests = new Map();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = requests.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      requests.set(key, entry);
    }

    entry.count += 1;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - entry.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    // Expired keys are removed opportunistically to keep memory bounded.
    if (requests.size > 1000) {
      for (const [requestKey, value] of requests) {
        if (value.resetAt <= now) requests.delete(requestKey);
      }
      while (requests.size > 1000) requests.delete(requests.keys().next().value);
    }

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      return res.status(429).json({ error: message });
    }

    next();
  };
}

module.exports = { createRateLimiter };
