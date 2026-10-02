import { query } from '../db.js';
import * as events from './eventModel.js';
import * as registrations from './registrationModel.js';

const ACTIVE = registrations.ACTIVE;

/**
 * Everything the student home screen needs in one round trip. Every number comes from the student's
 * own records; "recommended" is a transparent rule (see `reason` on each event), not a prediction.
 */
export async function dashboard(user) {
  const [mine, certs, explored, available, history] = await Promise.all([
    registrations.listForUser(user.id),
    query(`SELECT COUNT(*)::int AS n FROM certificates WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]),
    query(`SELECT COUNT(*)::int AS n FROM event_views WHERE user_id = $1`, [user.id]),
    events.listAvailable({}, user.id),
    query(
      `SELECT DISTINCT e.type FROM event_views v JOIN events e ON e.id = v.event_id WHERE v.user_id = $1
       UNION SELECT DISTINCT e.type FROM registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = $1`,
      [user.id],
    ),
  ]);

  const active = mine.filter((r) => ACTIVE.includes(r.status));
  const upcoming = active
    .filter((r) => r.eventStatus !== 'ended')
    .sort((a, b) => `${a.eventDate}${a.eventStartTime}`.localeCompare(`${b.eventDate}${b.eventStartTime}`));

  const registeredIds = new Set(active.map((r) => r.eventId));
  const likedTypes = new Set(history.map((h) => h.type));

  const recommended = available
    .filter((e) => !registeredIds.has(e.id) && e.availableSeats > 0 && e.registrationOpen)
    .map((e) => {
      let score = 0;
      let reason = 'Coming up soon';
      if (user.department && e.department === user.department) {
        score += 3;
        reason = `Made for ${user.department}`;
      } else if (likedTypes.has(e.type)) {
        score += 2;
        reason = `Because you looked at ${e.type.toLowerCase()} events`;
      }
      return { event: e, score, reason };
    })
    .sort((a, b) => b.score - a.score || `${a.event.date}${a.event.startTime}`.localeCompare(`${b.event.date}${b.event.startTime}`))
    .slice(0, 4)
    .map(({ event, reason }) => ({ ...event, reason }));

  return {
    stats: { registered: active.length, upcoming: upcoming.length, certificates: certs[0].n, explored: explored[0].n },
    next: upcoming[0] ?? null,
    recommended,
  };
}

/** Real totals for the public landing page. Satisfaction is only reported once people have given feedback. */
export async function publicStats() {
  const [row] = await query(
    `SELECT (SELECT COUNT(*)::int FROM events) AS events,
            (SELECT COUNT(*)::int FROM users WHERE role = 'participant') AS participants,
            (SELECT COUNT(DISTINCT college)::int FROM users WHERE college IS NOT NULL AND college <> '') AS colleges,
            (SELECT COUNT(*)::int FROM feedback WHERE session_id IS NULL) AS "feedbackCount",
            (SELECT AVG(overall)::float FROM feedback WHERE session_id IS NULL) AS "averageRating"`,
  );
  return {
    events: row.events,
    participants: row.participants,
    colleges: row.colleges,
    satisfaction: row.feedbackCount > 0 ? Math.round((row.averageRating / 5) * 100) : null,
  };
}
