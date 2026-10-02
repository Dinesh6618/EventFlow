import { query } from '../db.js';
import { ACTIVE } from './registrationModel.js';
import { localNow } from '../utils/eventStatus.js';
import { notFound, unprocessable } from '../utils/httpError.js';

export const SESSION_TYPES = ['session', 'workshop', 'talk', 'break', 'competition', 'evaluation_round'];

const SELECT = `
  SELECT s.id, s.event_id AS "eventId", s.title, s.description,
         to_char(s.date, 'YYYY-MM-DD') AS date,
         to_char(s.start_time, 'HH24:MI') AS "startTime",
         to_char(s.end_time, 'HH24:MI') AS "endTime",
         s.venue, s.speaker, s.session_type AS "sessionType",
         s.updated_at AS "updatedAt"
    FROM schedule_items s`;

/** 'upcoming' | 'ongoing' | 'past' for one session. */
export function sessionStatus(item, now = localNow()) {
  if (now.dateTime < `${item.date}T${item.startTime}`) return 'upcoming';
  if (now.dateTime < `${item.date}T${item.endTime}`) return 'ongoing';
  return 'past';
}

const withStatus = (item, now) => ({ ...item, status: sessionStatus(item, now) });

export async function list(eventId) {
  const now = localNow();
  const rows = await query(`${SELECT} WHERE s.event_id = $1 ORDER BY s.date, s.start_time, s.id`, [eventId]);
  return rows.map((row) => withStatus(row, now));
}

export async function findById(eventId, id) {
  const rows = await query(`${SELECT} WHERE s.event_id = $1 AND s.id = $2`, [eventId, id]);
  return rows[0] ? withStatus(rows[0]) : undefined;
}

/** What participants want at a glance: what is on now, what is next, how many today. */
export function snapshot(items, now = localNow()) {
  const today = items.filter((i) => i.date === now.date);
  return {
    current: items.filter((i) => i.status === 'ongoing' && i.sessionType !== 'break'),
    next: items.find((i) => i.status === 'upcoming' && i.sessionType !== 'break') ?? null,
    todayCount: today.length,
  };
}

/** Sessions must fall on one of the event's days. */
function assertWithinEvent(event, date) {
  if (date < event.date || date > (event.endDate || event.date)) {
    const span = event.endDate && event.endDate !== event.date ? `${event.date} and ${event.endDate}` : event.date;
    throw unprocessable('Please fix the highlighted fields', { date: `Date must be on the event day (${span})` });
  }
}

export async function create(event, data) {
  assertWithinEvent(event, data.date);
  const rows = await query(
    `INSERT INTO schedule_items (event_id, title, description, date, start_time, end_time, venue, speaker, session_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [event.id, data.title, data.description, data.date, data.startTime, data.endTime, data.venue, data.speaker, data.sessionType],
  );
  return findById(event.id, rows[0].id);
}

export async function update(event, id, data) {
  assertWithinEvent(event, data.date);
  const rows = await query(
    `UPDATE schedule_items
        SET title = $3, description = $4, date = $5, start_time = $6, end_time = $7,
            venue = $8, speaker = $9, session_type = $10, updated_at = NOW()
      WHERE event_id = $1 AND id = $2 RETURNING id`,
    [event.id, id, data.title, data.description, data.date, data.startTime, data.endTime, data.venue, data.speaker, data.sessionType],
  );
  if (!rows[0]) throw notFound('Session not found');
  return findById(event.id, id);
}

export async function remove(eventId, id) {
  const rows = await query(`DELETE FROM schedule_items WHERE event_id = $1 AND id = $2 RETURNING title`, [eventId, id]);
  if (!rows[0]) throw notFound('Session not found');
  return rows[0];
}

/** Today's sessions, across the events a participant holds a seat in. */
export async function todayForUser(userId) {
  const now = localNow();
  const rows = await query(
    `${SELECT.replace('FROM schedule_items s', '')},
            e.name AS "eventName"
       FROM schedule_items s
       JOIN events e ON e.id = s.event_id
       JOIN registrations r ON r.event_id = s.event_id AND r.user_id = $1 AND r.status = ANY($2)
      WHERE s.date = $3::date
      ORDER BY s.start_time, s.id`,
    [userId, ACTIVE, now.date],
  );
  return rows.map((row) => withStatus(row, now));
}
