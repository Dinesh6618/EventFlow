import { query } from '../db.js';

/** Optional emails a person can switch off. The verification email is never in this list. */
export const EMAIL_CATEGORIES = ['reminders', 'announcements', 'team', 'certificates', 'platform'];
const DEFAULT_PREFS = Object.fromEntries(EMAIL_CATEGORIES.map((c) => [c, true]));

/* ------------------------------------------------------------ preferences */

export async function getPreferences(userId) {
  const row = (await query(`SELECT email_prefs AS prefs FROM users WHERE id = $1`, [userId]))[0];
  const stored = typeof row?.prefs === 'string' ? JSON.parse(row.prefs) : row?.prefs;
  return { ...DEFAULT_PREFS, ...stored };
}

export async function setPreferences(userId, patch) {
  const next = { ...(await getPreferences(userId)) };
  for (const key of EMAIL_CATEGORIES) if (typeof patch[key] === 'boolean') next[key] = patch[key];
  await query(`UPDATE users SET email_prefs = $2::jsonb WHERE id = $1`, [userId, JSON.stringify(next)]);
  return next;
}

/* -------------------------------------------------------------------- log */

export async function insertLog({ userId = null, recipient, template, subject }) {
  const rows = await query(
    `INSERT INTO email_logs (user_id, recipient, template, subject) VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, recipient, template, String(subject).slice(0, 255)],
  );
  return rows[0].id;
}

export const markSent = (id, providerMessageId) =>
  query(`UPDATE email_logs SET status = 'sent', sent_at = NOW(), provider_message_id = $2, error_message = NULL WHERE id = $1`, [id, providerMessageId]);

export const markFailed = (id, message) =>
  query(`UPDATE email_logs SET status = 'failed', error_message = $2 WHERE id = $1`, [id, String(message).slice(0, 300)]);

export const listLogs = ({ status, template, limit = 100 } = {}) =>
  query(
    `SELECT id, recipient, template, subject, status, provider_message_id AS "providerMessageId", error_message AS "errorMessage", created_at AS "createdAt", sent_at AS "sentAt"
       FROM email_logs WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR template = $2) ORDER BY created_at DESC, id DESC LIMIT ${Math.min(limit, 500)}`,
    [status ?? null, template ?? null],
  );

/** How many emails failed in the last day and the latest reason, so a broken setup is noticed. */
export async function recentFailures() {
  const count = (await query(`SELECT COUNT(*)::int AS n FROM email_logs WHERE status = 'failed' AND created_at > NOW() - INTERVAL '24 hours'`))[0].n;
  const latest = (await query(`SELECT template, error_message AS "errorMessage", created_at AS "createdAt" FROM email_logs WHERE status = 'failed' ORDER BY created_at DESC, id DESC LIMIT 1`))[0] ?? null;
  return { last24h: count, latest: count ? latest : null };
}

/** Counts for the last seven days, for the admin page. */
export async function stats() {
  const row = (
    await query(
      `SELECT COUNT(*) FILTER (WHERE status = 'sent')::int AS sent, COUNT(*) FILTER (WHERE status = 'failed')::int AS failed, COUNT(*) FILTER (WHERE status = 'queued')::int AS queued
         FROM email_logs WHERE created_at > NOW() - INTERVAL '7 days'`,
    )
  )[0];
  return row;
}
