import { query } from '../db.js';
import { ACTIVE, ATTENDABLE } from './registrationModel.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const pct = (part, whole) => (whole > 0 ? round1((part / whole) * 100) : 0);
const byEvent = (rows, key = 'n') => new Map(rows.map((r) => [r.eventId, r[key]]));
const get = (map, id) => map.get(id) ?? 0;

/**
 * Everything on the analytics dashboard for one organizer, computed from stored records.
 * filters: { eventId, type, from, to } (dates are event start dates, YYYY-MM-DD).
 *
 * Definitions (also shown in the UI):
 *  - Registrations: pending + approved + confirmed.
 *  - Attendance rate: checked-in people / approved + confirmed registrations.
 *  - Registration conversion: of people who opened the event page, the share who registered.
 *  - Engagement: share of registrations that took part beyond turning up: scanned into a session,
 *    joined a team, or sent feedback.
 *  - Completion: share of approved/confirmed registrations who hold a (non-revoked) participation,
 *    winner, runner-up or finalist certificate.
 */
export async function analytics(organizerId, filters = {}) {
  const params = [organizerId];
  const where = ['e.organizer_id = $1'];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.eventId) add('e.id = ?', filters.eventId);
  if (filters.type) add('e.type = ?', filters.type);
  if (filters.from) add('COALESCE(e.end_date, e.date) >= ?::date', filters.from);
  if (filters.to) add('e.date <= ?::date', filters.to);

  const events = await query(
    `SELECT e.id, e.name, e.type, e.max_participants AS capacity, to_char(e.date, 'YYYY-MM-DD') AS date
       FROM events e WHERE ${where.join(' AND ')} ORDER BY e.date, e.id`,
    params,
  );
  const ids = events.map((e) => e.id);
  const empty = ids.length === 0;

  const [reg, attended, views, teams, feedback, completion, engagement, certificates] = empty
    ? [[], [], [], [], [], [], [], []]
    : await Promise.all([
        query(
          `SELECT event_id AS "eventId",
                  COUNT(*) FILTER (WHERE status = ANY($2))::int AS registered,
                  COUNT(*) FILTER (WHERE status = ANY($3))::int AS attendable
             FROM registrations WHERE event_id = ANY($1) GROUP BY event_id`,
          [ids, ACTIVE, ATTENDABLE],
        ),
        query(`SELECT event_id AS "eventId", COUNT(*)::int AS n FROM attendance WHERE event_id = ANY($1) GROUP BY event_id`, [ids]),
        query(
          `SELECT v.event_id AS "eventId", COUNT(*)::int AS viewers,
                  COUNT(*) FILTER (WHERE EXISTS (
                    SELECT 1 FROM registrations r WHERE r.event_id = v.event_id AND r.user_id = v.user_id AND r.status = ANY($2)
                  ))::int AS registered
             FROM event_views v WHERE v.event_id = ANY($1) GROUP BY v.event_id`,
          [ids, ACTIVE],
        ),
        query(`SELECT event_id AS "eventId", COUNT(*)::int AS n FROM teams WHERE event_id = ANY($1) GROUP BY event_id`, [ids]),
        query(
          `SELECT event_id AS "eventId", COUNT(*)::int AS n, AVG(overall)::float8 AS avg
             FROM feedback WHERE event_id = ANY($1) AND session_id IS NULL GROUP BY event_id`,
          [ids],
        ),
        query(
          `SELECT c.event_id AS "eventId", COUNT(DISTINCT c.recipient_key)::int AS n
             FROM certificates c WHERE c.event_id = ANY($1) AND c.revoked_at IS NULL
              AND c.type IN ('participant', 'winner', 'runner_up', 'finalist') GROUP BY c.event_id`,
          [ids],
        ),
        query(
          `SELECT r.event_id AS "eventId", COUNT(*)::int AS n
             FROM registrations r
            WHERE r.event_id = ANY($1) AND r.status = ANY($2) AND (
                  EXISTS (SELECT 1 FROM session_attendance sa JOIN schedule_items s ON s.id = sa.session_id
                           WHERE s.event_id = r.event_id AND sa.registration_id = r.id)
               OR EXISTS (SELECT 1 FROM team_members m WHERE m.event_id = r.event_id AND m.user_id = r.user_id)
               OR EXISTS (SELECT 1 FROM feedback f WHERE f.event_id = r.event_id AND f.user_id = r.user_id)
            ) GROUP BY r.event_id`,
          [ids, ACTIVE],
        ),
        query(`SELECT COUNT(*)::int AS n FROM certificates WHERE event_id = ANY($1) AND revoked_at IS NULL`, [ids]),
      ]);

  const regBy = new Map(reg.map((r) => [r.eventId, r]));
  const viewBy = new Map(views.map((r) => [r.eventId, r]));
  const fbBy = new Map(feedback.map((r) => [r.eventId, r]));
  const attendedBy = byEvent(attended);
  const teamsBy = byEvent(teams);
  const completionBy = byEvent(completion);
  const engagementBy = byEvent(engagement);

  const performance = events.map((e) => {
    const r = regBy.get(e.id) ?? { registered: 0, attendable: 0 };
    const v = viewBy.get(e.id) ?? { viewers: 0, registered: 0 };
    const f = fbBy.get(e.id);
    return {
      eventId: e.id,
      name: e.name,
      type: e.type,
      date: e.date,
      capacity: e.capacity,
      registrations: r.registered,
      fillRate: pct(r.registered, e.capacity),
      attendance: get(attendedBy, e.id),
      attendanceRate: pct(get(attendedBy, e.id), r.attendable),
      conversion: pct(v.registered, v.viewers),
      viewers: v.viewers,
      engagement: pct(get(engagementBy, e.id), r.registered),
      feedbackAverage: f ? round2(f.avg) : null,
      feedbackResponses: f?.n ?? 0,
      completion: pct(get(completionBy, e.id), r.attendable),
      teams: get(teamsBy, e.id),
    };
  });

  const sum = (key) => performance.reduce((total, p) => total + p[key], 0);
  const attendable = reg.reduce((total, r) => total + r.attendable, 0);
  const viewers = views.reduce((total, v) => total + v.viewers, 0);
  const viewerRegs = views.reduce((total, v) => total + v.registered, 0);
  const feedbackResponses = feedback.reduce((total, f) => total + f.n, 0);
  const feedbackWeighted = feedback.reduce((total, f) => total + f.avg * f.n, 0);

  const summary = {
    events: events.length,
    totalRegistrations: sum('registrations'),
    totalAttendance: sum('attendance'),
    attendanceRate: pct(sum('attendance'), attendable),
    registrationConversion: pct(viewerRegs, viewers),
    pageViewers: viewers,
    teamCount: sum('teams'),
    averageFeedback: feedbackResponses ? round2(feedbackWeighted / feedbackResponses) : null,
    feedbackResponses,
    certificateCount: certificates[0]?.n ?? 0,
  };

  if (empty) return { filters, summary, performance, charts: { registrationTrend: [], attendanceTrend: { granularity: 'day', points: [] }, departments: [], colleges: [], eventTypes: [], sessionAttendance: [], feedbackRatings: [] } };

  const [regDays, checkIns, departments, colleges, sessions, ratings] = await Promise.all([
    query(
      `SELECT to_char(registered_at, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
         FROM registrations WHERE event_id = ANY($1) AND status = ANY($2) GROUP BY 1 ORDER BY 1`,
      [ids, ACTIVE],
    ),
    query(`SELECT to_char(check_in_time, 'YYYY-MM-DD') AS day, to_char(check_in_time, 'HH24') AS hour FROM attendance WHERE event_id = ANY($1)`, [ids]),
    query(
      `SELECT COALESCE(NULLIF(u.department, ''), 'Not specified') AS name, COUNT(*)::int AS value
         FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ANY($1) AND r.status = ANY($2)
        GROUP BY 1 ORDER BY value DESC, name`,
      [ids, ACTIVE],
    ),
    query(
      `SELECT COALESCE(NULLIF(u.college, ''), 'Not specified') AS name, COUNT(*)::int AS value
         FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ANY($1) AND r.status = ANY($2)
        GROUP BY 1 ORDER BY value DESC, name`,
      [ids, ACTIVE],
    ),
    query(
      `SELECT s.id, s.title, e.name AS "eventName", to_char(s.date, 'YYYY-MM-DD') AS date, to_char(s.start_time, 'HH24:MI') AS time,
              (SELECT COUNT(*)::int FROM session_attendance sa WHERE sa.session_id = s.id) AS value,
              (SELECT COUNT(*)::int FROM registrations r WHERE r.event_id = s.event_id AND r.status = ANY($2)) AS registered
         FROM schedule_items s JOIN events e ON e.id = s.event_id
        WHERE s.event_id = ANY($1) AND s.session_type <> 'break' ORDER BY s.date, s.start_time, s.id LIMIT 20`,
      [ids, ATTENDABLE],
    ),
    query(`SELECT overall AS rating, COUNT(*)::int AS value FROM feedback WHERE event_id = ANY($1) AND session_id IS NULL GROUP BY overall`, [ids]),
  ]);

  return {
    filters,
    summary,
    performance,
    charts: {
      registrationTrend: dailySeries(regDays),
      attendanceTrend: attendanceSeries(checkIns),
      departments: topWithOther(departments),
      colleges: topWithOther(colleges),
      eventTypes: byType(performance),
      sessionAttendance: sessions.map((s) => ({ ...s, label: events.length > 1 ? `${s.title} (${s.eventName})` : s.title, percentage: pct(s.value, s.registered) })),
      feedbackRatings: [5, 4, 3, 2, 1].map((rating) => ({ rating, value: ratings.find((r) => r.rating === rating)?.value ?? 0 })),
    },
  };
}

/** Registrations per day, every day between the first and last filled in (capped at 120 days), plus a running total. */
function dailySeries(rows) {
  if (rows.length === 0) return [];
  const counts = new Map(rows.map((r) => [r.day, r.n]));
  const start = new Date(`${rows[0].day}T00:00:00Z`);
  const end = new Date(`${rows[rows.length - 1].day}T00:00:00Z`);
  const first = new Date(Math.max(start, end - 119 * 86400000));
  let running = rows.filter((r) => new Date(`${r.day}T00:00:00Z`) < first).reduce((total, r) => total + r.n, 0);
  const points = [];
  for (let d = first; d <= end; d = new Date(d.getTime() + 86400000)) {
    const day = d.toISOString().slice(0, 10);
    const n = counts.get(day) ?? 0;
    running += n;
    points.push({ label: day, value: n, total: running });
  }
  return points;
}

/** Check-ins per hour when they all fall on one day, otherwise per day. */
function attendanceSeries(rows) {
  if (rows.length === 0) return { granularity: 'day', points: [] };
  const days = new Set(rows.map((r) => r.day));
  if (days.size === 1) {
    const counts = new Map();
    for (const r of rows) counts.set(r.hour, (counts.get(r.hour) ?? 0) + 1);
    const hours = [...counts.keys()].map(Number);
    const points = [];
    for (let h = Math.min(...hours); h <= Math.max(...hours); h += 1) {
      const key = String(h).padStart(2, '0');
      points.push({ label: `${key}:00`, value: counts.get(key) ?? 0 });
    }
    return { granularity: 'hour', day: [...days][0], points };
  }
  const counts = new Map();
  for (const r of rows) counts.set(r.day, (counts.get(r.day) ?? 0) + 1);
  return { granularity: 'day', points: [...counts.entries()].sort().map(([label, value]) => ({ label, value })) };
}

/** Keep the biggest groups; fold the long tail into "Other" so a chart never needs a ninth colour. */
function topWithOther(rows, keep = 7) {
  if (rows.length <= keep + 1) return rows;
  const head = rows.slice(0, keep);
  const other = rows.slice(keep).reduce((total, r) => total + r.value, 0);
  return [...head, { name: 'Other', value: other }];
}

function byType(performance) {
  const groups = new Map();
  for (const p of performance) {
    const g = groups.get(p.type) ?? { name: p.type, events: 0, value: 0, attendance: 0 };
    g.events += 1;
    g.value += p.registrations;
    g.attendance += p.attendance;
    groups.set(p.type, g);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}
