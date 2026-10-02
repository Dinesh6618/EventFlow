/**
 * Tiny in-memory sliding-window limiter, keyed by client IP. Enough to stop someone walking
 * through certificate IDs on the public verification endpoint; use a shared store (Redis) if
 * the API ever runs on several instances.
 */
export function rateLimit({ windowMs = 60_000, max = 60, key: keyOf = (req) => req.ip } = {}) {
  const hits = new Map();

  // Drop old entries now and then so the map cannot grow without bound.
  const sweep = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, times] of hits) {
      const recent = times.filter((t) => t > cutoff);
      if (recent.length) hits.set(key, recent);
      else hits.delete(key);
    }
  }, windowMs);
  sweep.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyOf(req);
    const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= max) {
      res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please wait a moment and try again.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
