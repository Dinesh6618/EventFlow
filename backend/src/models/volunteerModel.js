import { query, transaction } from '../db.js';
import { conflict, notFound } from '../utils/httpError.js';
import { localNow } from '../utils/eventStatus.js';

const APPLICATION = `a.id, a.event_id AS "eventId", a.message, a.status, a.created_at AS "createdAt", a.decided_at AS "decidedAt"`;

/** Events that have not finished, with the viewer's application status and whether they already volunteer. */
export async function opportunities(userId) {
  return query(
    `SELECT e.id AS "eventId", e.name AS "eventName", e.type, e.venue, e.college,
            to_char(e.date, 'YYYY-MM-DD') AS date, to_char(COALESCE(e.end_date, e.date), 'YYYY-MM-DD') AS "endDate",
            to_char(e.start_time, 'HH24:MI') AS "startTime", to_char(e.end_time, 'HH24:MI') AS "endTime",
            a.status AS "applicationStatus",
            EXISTS (SELECT 1 FROM event_staff s WHERE s.event_id = e.id AND s.user_id = $1 AND s.staff_role = 'volunteer') AS "isVolunteer"
       FROM events e
       LEFT JOIN volunteer_applications a ON a.event_id = e.id AND a.user_id = $1
      WHERE COALESCE(e.end_date, e.date) >= $2::date
      ORDER BY e.date, e.start_time`,
    [userId, localNow().date],
  );
}

/** Apply (or re-apply after a decline). A pending or approved application cannot be repeated. */
export async function apply(event, userId, message) {
  const staffed = await query(`SELECT 1 FROM event_staff WHERE event_id = $1 AND user_id = $2 AND staff_role = 'volunteer'`, [event.id, userId]);
  if (staffed.length) throw conflict('You are already a volunteer for this event');
  const rows = await query(
    `INSERT INTO volunteer_applications (event_id, user_id, message) VALUES ($1, $2, $3)
     ON CONFLICT (event_id, user_id) DO UPDATE SET message = EXCLUDED.message, status = 'pending', decided_at = NULL, created_at = NOW()
       WHERE volunteer_applications.status = 'declined'
     RETURNING id`,
    [event.id, userId, message],
  );
  if (!rows[0]) throw conflict('You have already applied to volunteer for this event');
  return rows[0].id;
}

/** Withdraw a pending application. */
export async function withdraw(eventId, userId) {
  const rows = await query(`DELETE FROM volunteer_applications WHERE event_id = $1 AND user_id = $2 AND status = 'pending' RETURNING id`, [eventId, userId]);
  if (!rows[0]) throw notFound('No pending application to withdraw');
}

export async function listForEvent(eventId) {
  return query(
    `SELECT ${APPLICATION}, u.id AS "userId", u.name, u.email, u.department, u.college, u.year
       FROM volunteer_applications a JOIN users u ON u.id = a.user_id
      WHERE a.event_id = $1
      ORDER BY (a.status = 'pending') DESC, a.created_at DESC`,
    [eventId],
  );
}

/** Approve or decline a pending application. Approving makes the person a volunteer. Undefined if it was not pending. */
export async function decide(eventId, id, status, organizerId) {
  return transaction(async (run) => {
    const rows = await run(
      `UPDATE volunteer_applications SET status = $3, decided_at = NOW() WHERE id = $1 AND event_id = $2 AND status = 'pending'
       RETURNING id, user_id AS "userId", status`,
      [id, eventId, status],
    );
    if (!rows[0]) return undefined;
    if (status === 'approved') {
      await run(
        `INSERT INTO event_staff (event_id, user_id, staff_role, added_by) VALUES ($1, $2, 'volunteer', $3) ON CONFLICT DO NOTHING`,
        [eventId, rows[0].userId, organizerId],
      );
    }
    return rows[0];
  });
}

export async function find(eventId, id) {
  return (await query(`SELECT ${APPLICATION} FROM volunteer_applications a WHERE a.id = $1 AND a.event_id = $2`, [id, eventId]))[0];
}
