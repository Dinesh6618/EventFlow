import { query, transaction } from '../db.js';
import { ATTENDABLE } from './registrationModel.js';
import { getEventStatus, isEventDay, localNow } from '../utils/eventStatus.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const ACTIONS = ['check_in', 'check_out'];
/** QR payload prefix, so scanners can tell an EventFlow code from any other QR code. */
export const QR_PREFIX = 'EF1:';

const clock = (date) => new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Accepts "EF1:<token>" or a bare token typed by hand. Returns the token or null. */
export function parseQrPayload(raw) {
  const value = String(raw ?? '').trim();
  const token = value.startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
  return /^[0-9a-f]{64}$/.test(token) ? token : null;
}

const REGISTRATION_FOR_ATTENDANCE = `
  SELECT r.id, r.event_id AS "eventId", r.user_id AS "userId", r.status, r.participant_code AS "participantCode",
         u.name AS "participantName", u.department, u.college,
         to_char(e.date, 'YYYY-MM-DD') AS "date",
         to_char(COALESCE(e.end_date, e.date), 'YYYY-MM-DD') AS "endDate",
         to_char(e.start_time, 'HH24:MI') AS "startTime",
         to_char(e.end_time, 'HH24:MI') AS "endTime"
    FROM registrations r
    JOIN users u ON u.id = r.user_id
    JOIN events e ON e.id = r.event_id`;

function assertEligible(registration, now = localNow()) {
  const who = registration.participantName;
  if (!ATTENDABLE.includes(registration.status)) {
    throw conflict(`${who}'s registration is ${registration.status}, so attendance cannot be recorded`);
  }
  if (getEventStatus(registration, now) === 'ended') throw conflict('This event has already ended');
  if (!isEventDay(registration, now)) throw conflict(`Attendance opens on the day of the event (${registration.date})`);
}

/** Apply a check-in/out to one registration, enforcing every rule. Runs inside a transaction. */
async function apply(run, registration, action, actorId) {
  assertEligible(registration);
  const who = registration.participantName;

  const existing = (await run(`SELECT id, status, check_in_time AS "checkInTime", check_out_time AS "checkOutTime" FROM attendance WHERE registration_id = $1 FOR UPDATE`, [registration.id]))[0];

  if (action === 'check_in') {
    if (existing) throw conflict(`${who} already checked in at ${clock(existing.checkInTime)}`);
    await run(
      `INSERT INTO attendance (registration_id, event_id, user_id, status, checked_in_by)
       VALUES ($1, $2, $3, 'checked_in', $4)`,
      [registration.id, registration.eventId, registration.userId, actorId],
    );
    return 'checked_in';
  }

  if (!existing) throw conflict(`${who} has not checked in yet`);
  if (existing.status === 'checked_out') throw conflict(`${who} already checked out at ${clock(existing.checkOutTime)}`);
  await run(
    `UPDATE attendance SET status = 'checked_out', check_out_time = NOW(), checked_out_by = $2 WHERE id = $1`,
    [existing.id, actorId],
  );
  return 'checked_out';
}

const describe = (registration, result) => ({
  result,
  participant: {
    name: registration.participantName,
    participantCode: registration.participantCode,
    department: registration.department,
    college: registration.college,
  },
  at: new Date().toISOString(),
});

/**
 * Record someone entering one session. They are also checked in to the event if they were not yet,
 * so a session scan alone is enough at a door that only scans per session.
 */
async function applySession(run, registration, sessionId, actorId) {
  const session = (await run(
    `SELECT id, title, to_char(date, 'YYYY-MM-DD') AS date FROM schedule_items WHERE id = $1 AND event_id = $2`,
    [sessionId, registration.eventId],
  ))[0];
  if (!session) throw notFound('Session not found for this event');
  if (session.date !== localNow().date) throw conflict(`"${session.title}" is not scheduled for today`);

  assertEligible(registration);
  await run(
    `INSERT INTO attendance (registration_id, event_id, user_id, status, checked_in_by)
     VALUES ($1, $2, $3, 'checked_in', $4) ON CONFLICT (registration_id) DO NOTHING`,
    [registration.id, registration.eventId, registration.userId, actorId],
  );
  const rows = await run(
    `INSERT INTO session_attendance (session_id, registration_id, checked_in_by)
     VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING session_id`,
    [sessionId, registration.id, actorId],
  );
  if (!rows[0]) throw conflict(`${registration.participantName} already checked in to "${session.title}"`);
  return { result: 'session_checked_in', session: session.title };
}

/** Record attendance from a scanned QR payload (optionally for one session). */
export async function scan(eventId, rawPayload, action, actorId, sessionId = null) {
  const token = parseQrPayload(rawPayload);
  if (!token) throw unprocessable('This is not a valid EventFlow QR code');
  if (sessionId && action !== 'check_in') throw unprocessable('Sessions only support check-in');

  return transaction(async (run) => {
    const registration = (await run(`${REGISTRATION_FOR_ATTENDANCE} WHERE r.qr_token = $1 FOR UPDATE OF r`, [token]))[0];
    if (!registration) throw notFound('QR code not recognised');
    if (registration.eventId !== eventId) throw conflict('This QR code belongs to a different event');
    if (sessionId) {
      const { result, session } = await applySession(run, registration, sessionId, actorId);
      return { ...describe(registration, result), session };
    }
    return describe(registration, await apply(run, registration, action, actorId));
  });
}

/** Organizer fallback for people who cannot show their QR code. */
export async function mark(eventId, registrationId, action, actorId) {
  return transaction(async (run) => {
    const registration = (await run(`${REGISTRATION_FOR_ATTENDANCE} WHERE r.id = $1 AND r.event_id = $2 FOR UPDATE OF r`, [registrationId, eventId]))[0];
    if (!registration) throw notFound('Registration not found for this event');
    return describe(registration, await apply(run, registration, action, actorId));
  });
}

/** Attendance state for display: Registered / Checked In / Checked Out / Absent. */
export function stateOf(row, eventEnded) {
  if (row.attendanceStatus === 'checked_out') return 'checked_out';
  if (row.attendanceStatus === 'checked_in') return 'checked_in';
  return eventEnded ? 'absent' : 'registered';
}

/** Everyone entitled to attend (approved/confirmed) with their attendance row, if any. */
export async function listAttendees(event, { q, state } = {}) {
  const rows = await query(
    `SELECT r.id AS "registrationId", r.participant_code AS "participantCode",
            u.name, u.email, u.department, u.college,
            a.status AS "attendanceStatus", a.check_in_time AS "checkInTime", a.check_out_time AS "checkOutTime"
       FROM registrations r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN attendance a ON a.registration_id = r.id
      WHERE r.event_id = $1 AND r.status = ANY($2)
      ORDER BY u.name, r.id`,
    [event.id, ATTENDABLE],
  );
  const ended = event.status === 'ended';
  const needle = q?.toLowerCase();
  return rows
    .map((row) => ({ ...row, state: stateOf(row, ended) }))
    .filter((row) => !state || row.state === state)
    .filter((row) => !needle || [row.name, row.email, row.participantCode].some((v) => v.toLowerCase().includes(needle)));
}

export function summarize(attendees) {
  const count = (state) => attendees.filter((a) => a.state === state).length;
  const total = attendees.length;
  const attended = count('checked_in') + count('checked_out');
  return {
    totalRegistered: total,
    checkedIn: count('checked_in'),
    checkedOut: count('checked_out'),
    attended,
    notCheckedIn: total - attended,
    absent: count('absent'),
    attendancePercentage: total ? Math.round((attended / total) * 1000) / 10 : 0,
  };
}

/** Latest scans for the live feed. */
export async function recent(eventId, limit = 10) {
  return query(
    `SELECT u.name, r.participant_code AS "participantCode", a.status,
            GREATEST(a.check_in_time, COALESCE(a.check_out_time, a.check_in_time)) AS "at"
       FROM attendance a
       JOIN registrations r ON r.id = a.registration_id
       JOIN users u ON u.id = a.user_id
      WHERE a.event_id = $1
      ORDER BY "at" DESC LIMIT $2`,
    [eventId, limit],
  );
}
