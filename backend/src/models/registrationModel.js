import { query, transaction } from '../db.js';
import { getEventStatus, isRegistrationOpen, localNow } from '../utils/eventStatus.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'confirmed'];
/** Statuses that hold a seat. */
export const ACTIVE = ['pending', 'approved', 'confirmed'];
/** Statuses that entitle the person to attend (QR code, check-in, certificates). */
export const ATTENDABLE = ['approved', 'confirmed'];

/** What the organizer may change a registration to, by current status. */
const ORGANIZER_TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['rejected'],
  confirmed: ['rejected'],
  rejected: ['approved'],
};

const COLUMNS = `
  r.id,
  r.event_id AS "eventId",
  r.user_id AS "userId",
  r.participant_code AS "participantCode",
  r.status,
  r.registered_at AS "registeredAt",
  r.updated_at AS "updatedAt",
  r.cancelled_at AS "cancelledAt",
  r.decided_at AS "decidedAt"`;

const NEXT_CODE = `'EF-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('participant_code_seq')::text, 6, '0')`;

export async function findById(id) {
  const rows = await query(`SELECT ${COLUMNS} FROM registrations r WHERE r.id = $1`, [id]);
  return rows[0];
}

export async function findForUser(eventId, userId) {
  const rows = await query(`SELECT ${COLUMNS} FROM registrations r WHERE r.event_id = $1 AND r.user_id = $2`, [
    eventId,
    userId,
  ]);
  return rows[0];
}

/** Lock the event row so concurrent registrations cannot oversell the last seats. */
async function lockEvent(run, eventId) {
  const rows = await run(
    `SELECT id, organizer_id AS "organizerId", max_participants AS "maxParticipants",
            requires_approval AS "requiresApproval",
            to_char(date, 'YYYY-MM-DD') AS date,
            to_char(COALESCE(end_date, date), 'YYYY-MM-DD') AS "endDate",
            to_char(start_time, 'HH24:MI') AS "startTime",
            to_char(end_time, 'HH24:MI') AS "endTime",
            to_char(registration_deadline, 'YYYY-MM-DD"T"HH24:MI') AS "registrationDeadline"
       FROM events WHERE id = $1 FOR UPDATE`,
    [eventId],
  );
  if (!rows[0]) throw notFound('Event not found');
  return rows[0];
}

async function activeCount(run, eventId) {
  const rows = await run(
    `SELECT COUNT(*)::int AS count FROM registrations WHERE event_id = $1 AND status = ANY($2)`,
    [eventId, ACTIVE],
  );
  return rows[0].count;
}

/** Register (or re-register after cancelling). Returns the registration row. */
export async function register(eventId, userId) {
  return transaction(async (run) => {
    const event = await lockEvent(run, eventId);
    const now = localNow();

    if (getEventStatus(event, now) === 'ended') throw conflict('This event has already ended');
    if (!isRegistrationOpen(event, now)) throw conflict('Registration for this event has closed');

    const existing = (await run(`SELECT id, status FROM registrations WHERE event_id = $1 AND user_id = $2`, [eventId, userId]))[0];
    if (existing && ACTIVE.includes(existing.status)) throw conflict('You are already registered for this event');
    if (existing?.status === 'rejected') throw conflict('Your registration for this event was declined by the organizer');

    if ((await activeCount(run, eventId)) >= event.maxParticipants) throw conflict('This event is full');

    const status = event.requiresApproval ? 'pending' : 'confirmed';
    const rows = existing
      ? await run(
          `UPDATE registrations
              SET status = $2, cancelled_at = NULL, decided_by = NULL, decided_at = NULL,
                  registered_at = NOW(), updated_at = NOW(),
                  -- a fresh code, so a screenshot of the old QR stops working
                  qr_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
            WHERE id = $1 RETURNING id`,
          [existing.id, status],
        )
      : await run(
          `INSERT INTO registrations (event_id, user_id, participant_code, status)
           VALUES ($1, $2, ${NEXT_CODE}, $3) RETURNING id`,
          [eventId, userId, status],
        );
    return { id: rows[0].id, eventId, organizerId: event.organizerId, status };
  });
}

/** Participant cancels their own registration (before the event starts). */
export async function cancel(registrationId, userId) {
  return transaction(async (run) => {
    const found = (await run(`SELECT id, event_id AS "eventId", user_id AS "userId", status FROM registrations WHERE id = $1 FOR UPDATE`, [registrationId]))[0];
    if (!found || found.userId !== userId) throw notFound('Registration not found');
    if (!ACTIVE.includes(found.status)) throw conflict(`This registration is already ${found.status}`);

    const event = await lockEvent(run, found.eventId);
    if (getEventStatus(event) !== 'upcoming') throw conflict('You cannot cancel once the event has started');

    await run(`UPDATE registrations SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW() WHERE id = $1`, [registrationId]);
    return { ...found, status: 'cancelled', organizerId: event.organizerId };
  });
}

/** Organizer approves or rejects. Approving a previously rejected person re-checks capacity. */
export async function decide(registrationId, organizerId, nextStatus) {
  return transaction(async (run) => {
    const found = (await run(`SELECT id, event_id AS "eventId", user_id AS "userId", status FROM registrations WHERE id = $1 FOR UPDATE`, [registrationId]))[0];
    if (!found) throw notFound('Registration not found');

    const event = await lockEvent(run, found.eventId);
    if (event.organizerId !== organizerId) throw notFound('Registration not found');

    if (!ORGANIZER_TRANSITIONS[found.status]?.includes(nextStatus)) {
      throw conflict(`A ${found.status} registration cannot be changed to ${nextStatus}`);
    }
    if (found.status === 'rejected' && (await activeCount(run, found.eventId)) >= event.maxParticipants) {
      throw conflict('The event is full, so this registration cannot be approved');
    }

    await run(
      `UPDATE registrations SET status = $2, decided_by = $3, decided_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [registrationId, nextStatus, organizerId],
    );
    return { ...found, previousStatus: found.status, status: nextStatus };
  });
}

const EVENT_COLUMNS = `
  e.name AS "eventName", e.venue AS "eventVenue", e.type AS "eventType", e.image AS "eventImage",
  e.requires_approval AS "requiresApproval",
  to_char(e.date, 'YYYY-MM-DD') AS "eventDate",
  to_char(COALESCE(e.end_date, e.date), 'YYYY-MM-DD') AS "eventEndDate",
  to_char(e.start_time, 'HH24:MI') AS "eventStartTime",
  to_char(e.end_time, 'HH24:MI') AS "eventEndTime"`;

function withEventState(row, now = localNow()) {
  const event = { date: row.eventDate, endDate: row.eventEndDate, startTime: row.eventStartTime, endTime: row.eventEndTime };
  return {
    ...row,
    eventImage: row.eventImage ? `/uploads/${row.eventImage}` : null,
    eventStatus: getEventStatus(event, now),
  };
}

/** A participant's registrations, newest first, with just enough event info for lists. */
export async function listForUser(userId) {
  const now = localNow();
  const rows = await query(
    `SELECT ${COLUMNS}, ${EVENT_COLUMNS},
            CASE WHEN r.status = ANY($2) THEN r.qr_token END AS "qrToken",
            a.status AS "attendanceStatus", a.check_in_time AS "checkInTime", a.check_out_time AS "checkOutTime"
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       LEFT JOIN attendance a ON a.registration_id = r.id
      WHERE r.user_id = $1
      ORDER BY e.date DESC, e.start_time DESC, r.id DESC`,
    [userId, ATTENDABLE],
  );
  return rows.map((row) => withEventState(row, now));
}

/**
 * Organizer view of participants across their events.
 * `filters`: eventId, q, department, college, status. `page`: { limit, offset } or null for all rows.
 */
export async function listForOrganizer(organizerId, filters, page) {
  const params = [organizerId];
  const where = ['e.organizer_id = $1'];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.eventId) add('e.id = ?', filters.eventId);
  if (filters.status) add('r.status = ?', filters.status);
  if (filters.department) add('u.department = ?', filters.department);
  if (filters.college) add('u.college = ?', filters.college);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like);
    const n = params.length;
    where.push(`(u.name ILIKE $${n} OR u.email ILIKE $${n} OR r.participant_code ILIKE $${n})`);
  }

  const from = `FROM registrations r
                JOIN events e ON e.id = r.event_id
                JOIN users u ON u.id = r.user_id
                WHERE ${where.join(' AND ')}`;

  const total = (await query(`SELECT COUNT(*)::int AS count ${from}`, params))[0].count;

  const pageSql = page ? ` LIMIT ${Number(page.limit)} OFFSET ${Number(page.offset)}` : '';
  const registrations = await query(
    `SELECT ${COLUMNS}, e.name AS "eventName", u.name AS "participantName", u.email,
            u.department, u.college
       ${from}
      ORDER BY r.registered_at DESC, r.id DESC${pageSql}`,
    params,
  );
  return { registrations, total };
}

/** Distinct departments/colleges among this organizer's participants, for filter dropdowns. */
export async function filterOptions(organizerId) {
  const rows = await query(
    `SELECT DISTINCT u.department, u.college
       FROM registrations r JOIN events e ON e.id = r.event_id JOIN users u ON u.id = r.user_id
      WHERE e.organizer_id = $1`,
    [organizerId],
  );
  const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { departments: uniq('department'), colleges: uniq('college') };
}

/** One registration with participant and event info, only if the organizer owns the event. */
export async function detailForOrganizer(organizerId, registrationId) {
  const rows = await query(
    `SELECT ${COLUMNS}, e.id AS "eventId", e.name AS "eventName", u.name AS "participantName",
            u.email, u.department, u.college, u.created_at AS "memberSince"
       FROM registrations r
       JOIN events e ON e.id = r.event_id
       JOIN users u ON u.id = r.user_id
      WHERE r.id = $1 AND e.organizer_id = $2`,
    [registrationId, organizerId],
  );
  return rows[0];
}

export async function recordEventView(eventId, userId) {
  await query(`INSERT INTO event_views (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [eventId, userId]);
}

/** Throws a 422 if the participant has not filled in the details organizers need. */
export function assertProfileComplete(user) {
  if (!user.department || !user.college) {
    throw unprocessable('Add your department and college to your profile before registering', {
      profile: 'Department and college are required',
    });
  }
}
