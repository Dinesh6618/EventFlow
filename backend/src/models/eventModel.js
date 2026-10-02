import { query } from '../db.js';
import { getEventStatus, isRegistrationOpen, localNow } from '../utils/eventStatus.js';

const SELECT_EVENT = `
  SELECT e.id,
         e.organizer_id AS "organizerId",
         e.name,
         e.description,
         e.type,
         to_char(e.date, 'YYYY-MM-DD') AS date,
         to_char(e.start_time, 'HH24:MI') AS "startTime",
         to_char(e.end_time, 'HH24:MI') AS "endTime",
         e.venue,
         e.max_participants AS "maxParticipants",
         to_char(e.registration_deadline, 'YYYY-MM-DD"T"HH24:MI') AS "registrationDeadline",
         e.image,
         e.organizer_name AS "organizerName",
         e.organizer_contact AS "organizerContact",
         e.created_at AS "createdAt"
  FROM events e`;

/** Adds computed fields and turns the stored file name into a public URL. */
export function toEventDto(row, now = localNow()) {
  // Phase 1 has no registrations yet; Phase 2 will replace this with a real count.
  const registeredCount = 0;
  return {
    ...row,
    image: row.image ? `/uploads/${row.image}` : null,
    registeredCount,
    availableSeats: Math.max(row.maxParticipants - registeredCount, 0),
    status: getEventStatus(row, now),
    registrationOpen: isRegistrationOpen(row, now),
  };
}

const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Events that have not ended yet, soonest first, optionally filtered. */
export async function listAvailable({ q, type, date }) {
  const now = localNow();
  const params = [now.date];
  const where = ['e.date >= $1'];

  if (q) {
    params.push(`%${escapeLike(q)}%`);
    where.push(`(e.name ILIKE $${params.length} OR e.description ILIKE $${params.length} OR e.venue ILIKE $${params.length})`);
  }
  if (type) {
    params.push(type);
    where.push(`e.type = $${params.length}`);
  }
  if (date) {
    params.push(date);
    where.push(`e.date = $${params.length}`);
  }

  const rows = await query(
    `${SELECT_EVENT} WHERE ${where.join(' AND ')} ORDER BY e.date, e.start_time, e.id`,
    params,
  );
  return rows.map((row) => toEventDto(row, now)).filter((event) => event.status !== 'ended');
}

export async function listByOrganizer(organizerId) {
  const now = localNow();
  const rows = await query(`${SELECT_EVENT} WHERE e.organizer_id = $1 ORDER BY e.date DESC, e.start_time DESC, e.id DESC`, [
    organizerId,
  ]);
  return rows.map((row) => toEventDto(row, now));
}

export async function listAll() {
  const now = localNow();
  const rows = await query(`${SELECT_EVENT} ORDER BY e.date DESC, e.start_time DESC, e.id DESC`);
  return rows.map((row) => toEventDto(row, now));
}

export async function findById(id) {
  const rows = await query(`${SELECT_EVENT} WHERE e.id = $1`, [id]);
  return rows[0] ? toEventDto(rows[0]) : undefined;
}

export async function createEvent(organizerId, data) {
  const rows = await query(
    `INSERT INTO events (organizer_id, name, description, type, date, start_time, end_time, venue,
                         max_participants, registration_deadline, image, organizer_name, organizer_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      organizerId,
      data.name,
      data.description,
      data.type,
      data.date,
      data.startTime,
      data.endTime,
      data.venue,
      data.maxParticipants,
      data.registrationDeadline,
      data.image ?? null,
      data.organizerName,
      data.organizerContact,
    ],
  );
  return findById(rows[0].id);
}

/** Aggregate numbers from a list of event DTOs. */
export function summarize(events) {
  return {
    totalEvents: events.length,
    upcomingEvents: events.filter((e) => e.status === 'upcoming').length,
    // Active = running right now, or still accepting registrations.
    activeEvents: events.filter((e) => e.status === 'ongoing' || e.registrationOpen).length,
    totalParticipants: events.reduce((sum, e) => sum + e.registeredCount, 0),
  };
}
