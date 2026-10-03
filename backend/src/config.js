import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env.NODE_ENV || 'development';

if (env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set when NODE_ENV=production');
}

/** A number from the environment, or the default when it is missing or not a positive number. */
const positive = (name, fallback) => {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && process.env[name] !== '' && Number.isFinite(value) && value > 0 ? value : fallback;
};

/** TRUST_PROXY: how many reverse proxies sit in front of the API (so req.ip is the visitor, not the proxy). */
const trustProxy = (() => {
  const raw = (process.env.TRUST_PROXY ?? '').trim();
  if (raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  return /^\d+$/.test(raw) ? Number(raw) : raw; // a hop count, or a name such as "loopback"
})();

export const config = {
  env,
  trustProxy,
  port: Number(process.env.PORT) || 5000,
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  jwtExpiresIn: '7d',
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDir: path.resolve(rootDir, process.env.PGLITE_DIR || '.data/pglite'),
  // Where certificate QR codes point; must be the public address of the web app.
  appUrl: (process.env.APP_URL || process.env.PUBLIC_APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',')[0]).trim().replace(/\/$/, ''),
  // AI features. The key stays on the server: it is never sent to the browser or logged.
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-opus-5-5',
    effort: process.env.AI_EFFORT || 'medium',
    maxTokens: Number(process.env.AI_MAX_TOKENS) || 16000,
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 180000,
  },
  // Transactional email through Resend. The key lives on the server only and is never sent to the browser.
  email: {
    provider: 'resend',
    apiKey: process.env.EMAIL_PROVIDER_API_KEY || '',
    from: process.env.EMAIL_FROM || '',
    // Resend allows about two requests a second, so bulk email (reminders, announcements) is spaced out.
    sendIntervalMs: process.env.EMAIL_SEND_INTERVAL_MS === undefined ? 600 : Number(process.env.EMAIL_SEND_INTERVAL_MS),
    // 'true' / 'false' to force it. Left empty, verification is required exactly when email is configured,
    // so a server without email never locks people out.
    verificationOverride: process.env.EMAIL_VERIFICATION_REQUIRED === undefined || process.env.EMAIL_VERIFICATION_REQUIRED === '' ? null : process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
    // Schedule changes made close together go out as one email after this long.
    scheduleDigestMs: process.env.EMAIL_SCHEDULE_DIGEST_MS === undefined ? 120000 : Number(process.env.EMAIL_SCHEDULE_DIGEST_MS),
  },
  // Rate limits. Every number can be changed from the environment; see backend/.env.example.
  // A limit counts a window of time, so 100 per 900000 ms means 100 per fifteen minutes.
  rateLimit: {
    windowMs: positive('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    // Visitors who are not signed in, per IP address. Signed-in people are counted per account instead.
    max: positive('RATE_LIMIT_MAX', 100),
    // Per signed-in account: a safety net against a runaway script, far above what a person on the app reaches.
    userMax: positive('USER_RATE_LIMIT_MAX', 1500),
    // Login. Only FAILED attempts count, so logging in correctly is never blocked.
    auth: {
      windowMs: positive('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: positive('AUTH_RATE_LIMIT_MAX', 10), // failures per IP address and email together
      ipMax: positive('AUTH_RATE_LIMIT_IP_MAX', 50), // failures per IP address across all emails
    },
    // Sign-up attempts per IP address. Attempts that fail validation do not count.
    signup: {
      windowMs: positive('SIGNUP_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
      max: positive('SIGNUP_RATE_LIMIT_MAX', 5),
    },
    // The emails people can ask for: verification again, or after a change of email address.
    email: {
      windowMs: positive('EMAIL_RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
      max: positive('EMAIL_RATE_LIMIT_MAX', Number(process.env.EMAIL_RESEND_LIMIT) || 3), // per email address
      ipMax: positive('EMAIL_RATE_LIMIT_IP_MAX', 20), // per IP address
      cooldownSeconds: process.env.EMAIL_RESEND_COOLDOWN_SECONDS === undefined || process.env.EMAIL_RESEND_COOLDOWN_SECONDS === '' ? 60 : Number(process.env.EMAIL_RESEND_COOLDOWN_SECONDS),
    },
    // Opening the emailed verification link. The tokens cannot be guessed, so this only stops floods.
    link: {
      windowMs: positive('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
      max: positive('LINK_RATE_LIMIT_MAX', 200),
    },
    // On localhost in development the limits are this many times higher. 1 turns that off.
    devMultiplier: positive('RATE_LIMIT_DEV_MULTIPLIER', 10),
    // Write one line to the server log for every blocked request. 'false' silences it.
    log: process.env.RATE_LIMIT_LOG !== 'false',
  },
  uploadDir: path.join(rootDir, 'uploads'),
  // Help Center photos. Deliberately NOT under uploadDir, which is served publicly.
  helpUploadDir: path.resolve(rootDir, process.env.HELP_UPLOAD_DIR || 'private/help'),
  help: {
    // New help requests allowed per person in ten minutes, and how many may be open at once.
    createLimit: Number(process.env.HELP_CREATE_LIMIT) || 8,
    maxOpenPerEvent: Number(process.env.HELP_MAX_OPEN) || 5,
  },
  migrationsDir: path.join(rootDir, 'db', 'migrations'),
};

// The same address under its older name (certificate QR codes use it).
config.publicAppUrl = config.appUrl;

// Verification emails one account may have per hour. A getter, so a changed rate limit is picked up everywhere.
Object.defineProperty(config.email, 'resendLimit', { get: () => config.rateLimit.email.max, enumerable: true });
