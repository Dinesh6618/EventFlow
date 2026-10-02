import { query } from '../db.js';
import * as events from '../models/eventModel.js';

export async function stats(req, res) {
  const mine = await events.listByOrganizer(req.user.id);
  const upcoming = mine
    .filter((e) => e.status !== 'ended')
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
    .slice(0, 5);

  res.json({ stats: events.summarize(mine), upcomingEvents: upcoming });
}

/** The latest registrations and check-ins across this organizer's events, newest first. */
export async function activity(req, res) {
  const rows = await query(
    `SELECT * FROM (
        SELECT 'registered' AS kind, u.name AS "person", e.name AS "eventName", e.id AS "eventId", r.registered_at AS "at"
          FROM registrations r JOIN users u ON u.id = r.user_id JOIN events e ON e.id = r.event_id
         WHERE e.organizer_id = $1 AND r.status IN ('pending', 'approved', 'confirmed')
        UNION ALL
        SELECT 'checked_in', u.name, e.name, e.id, a.check_in_time
          FROM attendance a JOIN users u ON u.id = a.user_id JOIN events e ON e.id = a.event_id
         WHERE e.organizer_id = $1
      ) feed ORDER BY "at" DESC LIMIT 8`,
    [req.user.id],
  );
  res.json({ activity: rows });
}
