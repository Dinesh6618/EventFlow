import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * In-memory rate limiting, one fixed window per key. Each key costs a few bytes whatever the limit is,
 * expired keys are swept every minute, and the number of keys is capped, so memory cannot grow without
 * bound. This is right for a single API process (what EventFlow runs as today). If the API ever runs on
 * several instances, put the counters in a shared store such as Redis: only `take()` below would change.
 */

export const MAX_KEYS = 50_000; // per limiter
const stores = new Set();

/** How many keys are being counted right now, across all limiters. For checks and tests. */
export const limiterKeyCount = () => [...stores].reduce((total, store) => total + store.size, 0);

/** Forget every count. Used by tests; nothing in the app calls it. */
export const resetRateLimits = () => stores.forEach((store) => store.clear());

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const store of stores) {
    for (const [key, entry] of store) if (entry.resetAt <= now) store.delete(key);
  }
}, 60_000);
sweeper.unref();

/** Options may be plain values or functions, so a limit changed in the environment or in a test applies at once. */
const read = (value, req) => (typeof value === 'function' ? value(req) : value);

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** On localhost in development the limits are relaxed so working on the app is never blocked by them. */
const relaxed = (req) => config.env !== 'production' && LOOPBACK.has(req.ip);

/** The signed-in person behind a request, if its token is genuine. Cached on the request. */
export function userIdOf(req) {
  if (req.rateLimitUser !== undefined) return req.rateLimitUser;
  req.rateLimitUser = null;
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme === 'Bearer' && token) {
    try {
      req.rateLimitUser = jwt.verify(token, config.jwtSecret).sub ?? null;
    } catch {
      /* an invalid token is simply an anonymous visitor here; authenticate() rejects it later */
    }
  }
  return req.rateLimitUser;
}

/** The email address in the body, lowercased. Used to give each account its own allowance. */
export const emailOf = (req) => String(req.body?.email ?? '').trim().toLowerCase().slice(0, 254);

/** A short fingerprint of a secret, so it can be a map key without the secret being kept. */
export const fingerprint = (value) => crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 24);

/** The path of a request for the log: the route pattern when known, never a query string or a token. */
function safeEndpoint(req) {
  const path = req.route?.path ? `${req.baseUrl}${req.route.path}` : `${req.baseUrl}${req.path}`;
  return path
    .split('/')
    .map((part) => (/^[A-Za-z0-9_-]{20,}$/.test(part) ? ':redacted' : part))
    .join('/');
}

function logBlocked(req, category, retryAfter) {
  if (!config.rateLimit.log) return;
  // Only these fields: never the body, headers, query, tokens or passwords.
  console.warn(`[rate-limit] 429 ${JSON.stringify({
    at: new Date().toISOString(),
    category,
    method: req.method,
    endpoint: safeEndpoint(req),
    userId: req.user?.id ?? userIdOf(req),
    ip: req.ip,
    retryAfter,
  })}`);
}

/**
 * Express middleware that allows `max` requests per `windowMs` for each key, then answers 429 with
 * `{ success: false, message, retryAfter }` and a Retry-After header.
 *
 * name    – the category shown in the server log, for example "login".
 * key     – what is counted: the IP address by default.
 * skip    – requests that are not limited at all.
 * refund  – decides after the response whether this request should NOT count (for example a login
 *           that succeeded), so only the failures use up the allowance. A request that is refused
 *           by the limit itself never counts.
 */
export function rateLimit({ name = 'api', windowMs = 60_000, max = 60, key: keyOf = (req) => req.ip, skip, refund, message = 'Too many requests. Please try again later.' } = {}) {
  const store = new Map();
  stores.add(store);

  /** Count one request. Returns the entry, and whether it was allowed. */
  function take(key, limit, window) {
    const now = Date.now();
    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      if (store.size >= MAX_KEYS) {
        for (const [k, e] of store) if (e.resetAt <= now) store.delete(k);
        // Still full of live keys (an attack): forget the oldest ones rather than grow.
        for (const k of store.keys()) {
          if (store.size < MAX_KEYS) break;
          store.delete(k);
        }
      }
      entry = { count: 0, resetAt: now + window, logged: false };
      store.set(key, entry);
    }
    if (entry.count >= limit) return { entry, allowed: false };
    entry.count += 1;
    return { entry, allowed: true };
  }

  return (req, res, next) => {
    if (skip?.(req)) return next();
    const limit = Math.ceil(read(max, req) * (relaxed(req) ? config.rateLimit.devMultiplier : 1));
    const { entry, allowed } = take(String(keyOf(req)), limit, read(windowMs, req));

    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - Date.now()) / 1000));
      if (!entry.logged) {
        entry.logged = true; // one log line per key per window, so a flood cannot flood the log
        logBlocked(req, name, retryAfter);
      }
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ success: false, message, retryAfter });
    }

    if (refund) {
      res.on('finish', () => {
        if (entry.count > 0 && refund(req, res)) entry.count -= 1;
      });
    }
    next();
  };
}

/** Who is counted for general traffic: the signed-in account, otherwise the IP address. */
export const clientKey = (req) => {
  const id = userIdOf(req);
  return id ? `u:${id}` : `ip:${req.ip}`;
};
