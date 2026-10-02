import { query } from '../db.js';
import { ROLES } from '../constants.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const STAFF_ROLES = ['volunteer', 'judge'];

export async function has(eventId, userId, staffRole) {
  const rows = await query(
    `SELECT 1 FROM event_staff WHERE event_id = $1 AND user_id = $2 AND staff_role = $3`,
    [eventId, userId, staffRole],
  );
  return rows.length > 0;
}

export async function list(eventId, staffRole) {
  return query(
    `SELECT s.id, s.staff_role AS "staffRole", s.created_at AS "createdAt",
            u.id AS "userId", u.name, u.email, u.department, u.college
       FROM event_staff s JOIN users u ON u.id = s.user_id
      WHERE s.event_id = $1 AND ($2::text IS NULL OR s.staff_role = $2)
      ORDER BY s.created_at, s.id`,
    [eventId, staffRole ?? null],
  );
}

/** Add an existing participant account as volunteer/judge by email. */
export async function addByEmail(eventId, email, staffRole, addedBy) {
  const user = (await query(`SELECT id, role FROM users WHERE email = $1`, [email]))[0];
  if (!user || user.role !== ROLES.PARTICIPANT) {
    throw unprocessable('No participant account found with that email', {
      email: 'No participant account found with that email. They need to sign up first.',
    });
  }
  const rows = await query(
    `INSERT INTO event_staff (event_id, user_id, staff_role, added_by)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
    [eventId, user.id, staffRole, addedBy],
  );
  if (!rows[0]) throw conflict(`That person is already a ${staffRole} for this event`);
  return (await list(eventId)).find((s) => s.id === rows[0].id);
}

export async function remove(eventId, id) {
  const rows = await query(`DELETE FROM event_staff WHERE id = $1 AND event_id = $2 RETURNING id`, [id, eventId]);
  if (!rows[0]) throw notFound('Staff member not found');
}

/** Events a participant helps run, that have not finished yet. */
export async function assignmentsForUser(userId) {
  return query(
    `SELECT s.staff_role AS "staffRole", e.id AS "eventId", e.name AS "eventName", e.venue,
            to_char(e.date, 'YYYY-MM-DD') AS date,
            to_char(e.start_time, 'HH24:MI') AS "startTime",
            to_char(e.end_time, 'HH24:MI') AS "endTime"
       FROM event_staff s JOIN events e ON e.id = s.event_id
      WHERE s.user_id = $1
      ORDER BY e.date, e.start_time`,
    [userId],
  );
}
