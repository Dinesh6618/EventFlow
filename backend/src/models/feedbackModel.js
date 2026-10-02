import { query } from '../db.js';
import { ACTIVE } from './registrationModel.js';
import { sessionStatus } from './scheduleModel.js';
import { conflict, notFound } from '../utils/httpError.js';

const round2 = (n) => (n === null || n === undefined ? null : Math.round(n * 100) / 100);

async function hasSeat(eventId, userId) {
  const rows = await query(`SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2 AND status = ANY($3)`, [eventId, userId, ACTIVE]);
  return rows.length > 0;
}

const FEEDBACK_COLUMNS = `
  f.id, f.session_id AS "sessionId", f.overall, f.organization, f.speaker, f.venue,
  f.comments, f.suggestions, f.updated_at AS "updatedAt"`;

/** What the participant can rate now, and what they already submitted. */
export async function targetsFor(event, userId) {
  const [sessions, mine] = await Promise.all([
    query(
      `SELECT id, title, speaker, session_type AS "sessionType", to_char(date, 'YYYY-MM-DD') AS date,
              to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
         FROM schedule_items WHERE event_id = $1 AND session_type <> 'break' ORDER BY date, start_time`,
      [event.id],
    ),
    query(`SELECT ${FEEDBACK_COLUMNS} FROM feedback f WHERE f.event_id = $1 AND f.user_id = $2`, [event.id, userId]),
  ]);
  return {
    event: { open: event.status === 'ended', feedback: mine.find((f) => f.sessionId === null) ?? null },
    sessions: sessions
      .map((s) => ({ ...s, open: sessionStatus(s) === 'past', feedback: mine.find((f) => f.sessionId === s.id) ?? null }))
      .filter((s) => s.open || s.feedback),
  };
}

/** Create or update the caller's feedback for the event (sessionId null) or one of its sessions. */
export async function save(event, userId, sessionId, data) {
  if (!(await hasSeat(event.id, userId))) throw conflict('Only registered participants can leave feedback');

  let speakerOnly = false;
  if (sessionId) {
    const session = (await query(
      `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
         FROM schedule_items WHERE id = $1 AND event_id = $2`,
      [sessionId, event.id],
    ))[0];
    if (!session) throw notFound('Session not found');
    if (sessionStatus(session) !== 'past') throw conflict('You can rate a session once it has finished');
    speakerOnly = true; // organization and venue make sense for the whole event only
  } else if (event.status !== 'ended') {
    throw conflict('You can rate the event once it has finished');
  }

  const rows = await query(
    `INSERT INTO feedback (event_id, user_id, session_id, overall, organization, speaker, venue, comments, suggestions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (event_id, user_id, COALESCE(session_id, 0))
     DO UPDATE SET overall = EXCLUDED.overall, organization = EXCLUDED.organization, speaker = EXCLUDED.speaker,
                   venue = EXCLUDED.venue, comments = EXCLUDED.comments, suggestions = EXCLUDED.suggestions, updated_at = NOW()
     RETURNING id`,
    [
      event.id, userId, sessionId ?? null, data.overall,
      speakerOnly ? null : data.organization ?? null, data.speaker ?? null, speakerOnly ? null : data.venue ?? null,
      data.comments, data.suggestions,
    ],
  );
  return rows[0].id;
}

/** Ratings overview for the organizer. Individual responses are anonymous: no names or emails. */
export async function summary(event) {
  const [overview, distribution, sessions, comments, eligible] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS n, AVG(overall)::float8 AS overall, AVG(organization)::float8 AS organization,
              AVG(speaker)::float8 AS speaker, AVG(venue)::float8 AS venue
         FROM feedback WHERE event_id = $1 AND session_id IS NULL`,
      [event.id],
    ),
    query(`SELECT overall AS rating, COUNT(*)::int AS count FROM feedback WHERE event_id = $1 AND session_id IS NULL GROUP BY overall`, [event.id]),
    query(
      `SELECT s.id, s.title, s.speaker, to_char(s.date, 'YYYY-MM-DD') AS date, to_char(s.start_time, 'HH24:MI') AS "startTime",
              COUNT(f.id)::int AS responses, AVG(f.overall)::float8 AS overall, AVG(f.speaker)::float8 AS "speakerRating"
         FROM schedule_items s LEFT JOIN feedback f ON f.session_id = s.id
        WHERE s.event_id = $1 AND s.session_type <> 'break' GROUP BY s.id ORDER BY s.date, s.start_time`,
      [event.id],
    ),
    query(
      `SELECT f.id, f.session_id AS "sessionId", s.title AS "sessionTitle", f.overall, f.comments, f.suggestions, f.created_at AS "createdAt"
         FROM feedback f LEFT JOIN schedule_items s ON s.id = f.session_id
        WHERE f.event_id = $1 AND (f.comments <> '' OR f.suggestions <> '') ORDER BY f.updated_at DESC LIMIT 200`,
      [event.id],
    ),
    query(`SELECT COUNT(*)::int AS n FROM registrations WHERE event_id = $1 AND status = ANY($2)`, [event.id, ACTIVE]),
  ]);

  const o = overview[0];
  const counts = Object.fromEntries(distribution.map((d) => [d.rating, d.count]));
  return {
    responses: o.n,
    eligible: eligible[0].n,
    responseRate: eligible[0].n ? round2((o.n / eligible[0].n) * 100) : 0,
    averages: { overall: round2(o.overall), organization: round2(o.organization), speaker: round2(o.speaker), venue: round2(o.venue) },
    distribution: [5, 4, 3, 2, 1].map((rating) => ({ rating, count: counts[rating] ?? 0 })),
    sessions: sessions.map((s) => ({ ...s, overall: round2(s.overall), speakerRating: round2(s.speakerRating) })),
    comments,
  };
}
