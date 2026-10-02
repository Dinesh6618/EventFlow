import { query } from '../db.js';
import { ACTIVE, ATTENDABLE } from '../models/registrationModel.js';
import { getEventStatus, localNow } from '../utils/eventStatus.js';

const MINUTE = 60 * 1000;
const at = (date, time) => new Date(`${date}T${time}:00`); // stored values are local date/time
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : 0);

/**
 * Everything the recommendation rules and the control center know about one event, read from real
 * records. Only aggregate numbers and session titles are included; no participant names or emails.
 * `event` is an event DTO (models/eventModel). `now` is injectable so tests can move the clock.
 */
export async function collectMetrics(event, now = new Date()) {
  const clock = localNow(now);
  const id = event.id;
  const startsAt = at(event.date, event.startTime);
  const endsAt = at(event.endDate || event.date, event.endTime);
  const deadlineAt = new Date(`${event.registrationDeadline}:00`);

  const [statusRows, recent, views, attendanceRows, sessions, staff, teamRows, judgingRows, feedbackRows, lowSessions, certs, announcements] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS n FROM registrations WHERE event_id = $1 GROUP BY status`, [id]),
    query(
      `SELECT COUNT(*) FILTER (WHERE status = ANY($2) AND registered_at > NOW() - INTERVAL '24 hours')::int AS "last24h",
              COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(registered_at) FILTER (WHERE status = 'pending'))) / 3600, 0)::float8 AS "oldestPendingHours"
         FROM registrations WHERE event_id = $1`,
      [id, ACTIVE],
    ),
    query(
      `SELECT COUNT(*)::int AS viewers,
              COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM registrations r WHERE r.event_id = v.event_id AND r.user_id = v.user_id AND r.status = ANY($2)))::int AS registered
         FROM event_views v WHERE v.event_id = $1`,
      [id, ACTIVE],
    ),
    query(
      `SELECT COUNT(*)::int AS attended,
              COUNT(*) FILTER (WHERE status = 'checked_in')::int AS inside,
              COUNT(*) FILTER (WHERE status = 'checked_out')::int AS "checkedOut",
              COUNT(*) FILTER (WHERE check_in_time > NOW() - INTERVAL '10 minutes')::int AS "last10min",
              MAX(GREATEST(check_in_time, COALESCE(check_out_time, check_in_time))) AS "lastActivity"
         FROM attendance WHERE event_id = $1`,
      [id],
    ),
    query(
      `SELECT s.id, s.title, s.session_type AS type, s.venue, s.speaker, to_char(s.date, 'YYYY-MM-DD') AS date,
              to_char(s.start_time, 'HH24:MI') AS "startTime", to_char(s.end_time, 'HH24:MI') AS "endTime",
              (SELECT COUNT(*)::int FROM session_attendance sa WHERE sa.session_id = s.id) AS scans
         FROM schedule_items s WHERE s.event_id = $1 ORDER BY s.date, s.start_time, s.id`,
      [id],
    ),
    query(`SELECT staff_role AS role, COUNT(*)::int AS n FROM event_staff WHERE event_id = $1 GROUP BY staff_role`, [id]),
    query(
      `SELECT COUNT(*)::int AS teams,
              COUNT(*) FILTER (WHERE (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) < $2)::int AS "belowMin",
              COUNT(*) FILTER (WHERE t.submitted_at IS NULL)::int AS unsubmitted
         FROM teams t WHERE t.event_id = $1`,
      [id, event.minTeamSize],
    ),
    query(
      `SELECT (SELECT COUNT(*)::int FROM evaluation_criteria WHERE event_id = $1) AS criteria,
              (SELECT COUNT(*)::int FROM judge_assignments WHERE event_id = $1) AS assigned,
              (SELECT COUNT(*)::int FROM evaluations WHERE event_id = $1 AND status = 'submitted') AS submitted`,
      [id],
    ),
    query(
      `SELECT COUNT(*)::int AS responses, AVG(overall)::float8 AS overall, AVG(organization)::float8 AS organization,
              AVG(venue)::float8 AS venue, AVG(speaker)::float8 AS speaker
         FROM feedback WHERE event_id = $1 AND session_id IS NULL`,
      [id],
    ),
    query(
      `SELECT s.title, COUNT(f.id)::int AS n, AVG(f.overall)::float8 AS avg
         FROM schedule_items s JOIN feedback f ON f.session_id = s.id WHERE s.event_id = $1 GROUP BY s.id, s.title`,
      [id],
    ),
    query(`SELECT COUNT(*)::int AS n FROM certificates WHERE event_id = $1 AND revoked_at IS NULL AND type = 'participant'`, [id]),
    query(`SELECT COUNT(*)::int AS n, MAX(created_at) AS latest FROM announcements WHERE event_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [id]),
  ]);

  const unassigned = event.teamEnabled
    ? (await query(
        `SELECT COUNT(*)::int AS n FROM registrations r
          WHERE r.event_id = $1 AND r.status = ANY($2)
            AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.event_id = r.event_id AND m.user_id = r.user_id)`,
        [id, ACTIVE],
      ))[0].n
    : 0;

  const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, r.n]));
  const registered = ACTIVE.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  const attendable = ATTENDABLE.reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
  const att = attendanceRows[0];
  const status = getEventStatus(event, clock);

  const sessionItems = sessions.map((s) => {
    const start = at(s.date, s.startTime);
    const end = at(s.date, s.endTime);
    return { ...s, status: now < start ? 'upcoming' : now < end ? 'ongoing' : 'past', minutesToStart: Math.round((start - now) / MINUTE) };
  });
  const feedback = feedbackRows[0];

  return {
    now: clock,
    event: {
      id,
      name: event.name,
      status,
      capacity: event.maxParticipants,
      requiresApproval: event.requiresApproval,
      teamEnabled: event.teamEnabled,
      minTeamSize: event.minTeamSize,
      leaderboardPublished: event.leaderboardPublished,
    },
    timing: {
      minutesToStart: Math.round((startsAt - now) / MINUTE),
      minutesSinceStart: Math.round((now - startsAt) / MINUTE),
      minutesSinceEnd: Math.round((now - endsAt) / MINUTE),
      minutesToDeadline: Math.round((deadlineAt - now) / MINUTE),
    },
    registration: {
      registered,
      pending: byStatus.pending ?? 0,
      cancelled: byStatus.cancelled ?? 0,
      rejected: byStatus.rejected ?? 0,
      attendable,
      fillRate: pct(registered, event.maxParticipants),
      last24h: recent[0].last24h,
      oldestPendingHours: round1(recent[0].oldestPendingHours),
      viewers: views[0].viewers,
      conversion: pct(views[0].registered, views[0].viewers),
    },
    attendance: {
      attended: att.attended,
      inside: att.inside,
      checkedOut: att.checkedOut,
      rate: pct(att.attended, attendable),
      noShows: Math.max(attendable - att.attended, 0),
      last10min: att.last10min,
      lastActivity: att.lastActivity,
    },
    sessions: {
      total: sessionItems.length,
      items: sessionItems,
      today: sessionItems.filter((s) => s.date === clock.date).length,
      current: sessionItems.filter((s) => s.status === 'ongoing' && s.type !== 'break'),
      next: sessionItems.find((s) => s.status === 'upcoming' && s.type !== 'break') ?? null,
    },
    staff: { volunteers: staff.find((r) => r.role === 'volunteer')?.n ?? 0, judges: staff.find((r) => r.role === 'judge')?.n ?? 0 },
    teams: { count: teamRows[0].teams, belowMin: teamRows[0].belowMin, unsubmitted: teamRows[0].unsubmitted, unassigned, unassignedShare: pct(unassigned, registered) },
    judging: { criteria: judgingRows[0].criteria, assigned: judgingRows[0].assigned, submitted: judgingRows[0].submitted },
    feedback: {
      responses: feedback.responses,
      rate: pct(feedback.responses, attendable || registered),
      overall: feedback.responses ? round2(feedback.overall) : null,
      organization: feedback.organization === null ? null : round2(feedback.organization),
      venue: feedback.venue === null ? null : round2(feedback.venue),
      speaker: feedback.speaker === null ? null : round2(feedback.speaker),
      lowSessions: lowSessions.filter((s) => s.n >= 3 && s.avg < 3).map((s) => ({ title: s.title, avg: round2(s.avg), n: s.n })),
    },
    certificates: { participant: certs[0].n },
    announcements: { last24h: announcements[0].n, latest: announcements[0].latest },
  };
}
