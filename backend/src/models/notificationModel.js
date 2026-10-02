import { query } from '../db.js';
import { ACTIVE } from './registrationModel.js';
import { notFound } from '../utils/httpError.js';

export const TYPES = [
  'registration_confirmed',
  'registration_pending',
  'registration_approved',
  'registration_rejected',
  'new_registration',
  'schedule_change',
  'event_reminder',
  'session_starting',
  'announcement',
];

const COLUMNS = `
  n.id, n.type, n.title, n.message, n.link, n.event_id AS "eventId",
  n.read_at AS "readAt", n.created_at AS "createdAt", (n.read_at IS NOT NULL) AS read`;

const INSERT_TARGET = `INSERT INTO notifications (user_id, event_id, type, title, message, link, dedupe_key)`;
const NO_DUPLICATES = `ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`;

/** Notify one user. With `dedupeKey`, the same notification is only ever created once. */
export async function notify(userId, { eventId = null, type, title, message, link = null, dedupeKey = null }) {
  const rows = await query(
    `${INSERT_TARGET} VALUES ($1, $2, $3, $4, $5, $6, $7) ${NO_DUPLICATES} RETURNING id`,
    [userId, eventId, type, title, message, link, dedupeKey],
  );
  return rows.length;
}

/**
 * Notify everyone holding a registration for the event (and optionally its staff).
 * `statuses` picks which registration statuses count. Returns how many notifications were created.
 */
export async function notifyEvent(eventId, { type, title, message, link = null, dedupeKey = null }, { statuses = ACTIVE, includeStaff = false } = {}) {
  const rows = await query(
    `${INSERT_TARGET}
     SELECT recipients.user_id, $1, $2, $3, $4, $5, $6
       FROM (
         SELECT r.user_id FROM registrations r WHERE r.event_id = $1 AND r.status = ANY($7)
         ${includeStaff ? 'UNION SELECT s.user_id FROM event_staff s WHERE s.event_id = $1' : ''}
       ) recipients
     ${NO_DUPLICATES}
     RETURNING id`,
    [eventId, type, title, message, link, dedupeKey, statuses],
  );
  return rows.length;
}

export async function list(userId, { unreadOnly = false, limit = 20, before } = {}) {
  const params = [userId, limit];
  const where = ['n.user_id = $1'];
  if (unreadOnly) where.push('n.read_at IS NULL');
  if (before) {
    params.push(before);
    where.push(`n.id < $${params.length}`);
  }
  return query(`SELECT ${COLUMNS} FROM notifications n WHERE ${where.join(' AND ')} ORDER BY n.id DESC LIMIT $2`, params);
}

export async function unreadCount(userId) {
  const rows = await query(`SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]);
  return rows[0].count;
}

export async function markRead(userId, id) {
  const rows = await query(
    `UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND user_id = $2 RETURNING id`,
    [id, userId],
  );
  if (!rows[0]) throw notFound('Notification not found');
}

export async function markAllRead(userId) {
  const rows = await query(`UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL RETURNING id`, [userId]);
  return rows.length;
}

/** Run a notification side effect without ever failing the request that triggered it. */
export async function safely(task) {
  try {
    await task();
  } catch (err) {
    console.error('Could not create notification:', err.message);
  }
}
