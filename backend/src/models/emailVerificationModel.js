import crypto from 'node:crypto';
import { query, transaction } from '../db.js';

export const TOKEN_LIFETIME_HOURS = 24;

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Create a verification token, cancelling any unused ones. Returns the raw token (only ever emailed). */
export async function create(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await transaction(async (run) => {
    await run(`UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [userId]);
    await run(`INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + ($3 || ' hours')::interval)`, [userId, hash(token), String(TOKEN_LIFETIME_HOURS)]);
  });
  return token;
}

/** Throw a token away. Used when its email could not be sent, so the failed attempt is not counted against the account. */
export async function revoke(token) {
  await query(`DELETE FROM email_verification_tokens WHERE token_hash = $1 AND used_at IS NULL`, [hash(token)]);
}

/** How many verification emails this account has asked for in the last hour (the first one counts). */
export async function requestedLastHour(userId) {
  return (await query(`SELECT COUNT(*)::int AS n FROM email_verification_tokens WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [userId]))[0].n;
}

/** Whose token is this, whatever state it is in? Lets someone with an expired link ask for a new one. */
export async function userIdFor(token) {
  return (await query(`SELECT user_id AS "userId" FROM email_verification_tokens WHERE token_hash = $1`, [hash(token)]))[0]?.userId;
}

/**
 * Use a token to verify an email address, in one step.
 * Returns { status: 'ok' | 'invalid' | 'expired' | 'used', userId? }. A used or expired token changes nothing.
 */
export async function redeem(token) {
  return transaction(async (run) => {
    const row = (
      await run(
        `SELECT id, user_id AS "userId", used_at AS "usedAt", expires_at < NOW() AS expired FROM email_verification_tokens WHERE token_hash = $1 FOR UPDATE`,
        [hash(token)],
      )
    )[0];
    if (!row) return { status: 'invalid' };
    if (row.usedAt) return { status: 'used', userId: row.userId };
    if (row.expired) return { status: 'expired', userId: row.userId };
    await run(`UPDATE email_verification_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`, [row.userId]);
    await run(`UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = $1`, [row.userId]);
    return { status: 'ok', userId: row.userId };
  });
}
