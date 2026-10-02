import { query } from '../db.js';
import { getEventStatus, isRegistrationOpen, localNow } from '../utils/eventStatus.js';

const SELECT_EVENT = `
  SELECT e.id,
         e.organizer_id AS "organizerId",
         e.name,
         e.description,
         e.type,
         to_char(e.date, 'YYYY-MM-DD') AS date,
         to_char(COALESCE(e.end_date, e.date), 'YYYY-MM-DD') AS "endDate",
         to_char(e.start_time, 'HH24:MI') AS "startTime",
         to_char(e.end_time, 'HH24:MI') AS "endTime",
         e.venue,
         e.max_participants AS "maxParticipants",
         to_char(e.registration_deadline, 'YYYY-MM-DD"T"HH24:MI') AS "registrationDeadline",
         e.image,
         e.organizer_name AS "organizerName",
         e.organizer_contact AS "organizerContact",
         e.requires_approval AS "requiresApproval",
         e.leaderboard_published AS "leaderboardPublished",
         e.share_judge_comments AS "shareJudgeComments",
         e.team_enabled AS "teamEnabled",
         e.min_team_size AS "minTeamSize",
         e.max_team_size AS "maxTeamSize",
         e.allow_multiple_teams AS "allowMultipleTeams",
         e.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM registrations r
           WHERE r.event_id = e.id AND r.status IN ('pending', 'approved', 'confirmed')) AS "registeredCount"
  FROM events e`;

/** Adds computed fields and turns the stored file name into a public URL. */
export function toEventDto(row, now = localNow()) {
  return {
    ...row,
    image: row.image ? `/uploads/${row.image}` : null,
    // Pending, approved and confirmed registrations all hold a seat.
    availableSeats: Math.max(row.maxParticipants - row.registeredCount, 0),
    status: getEventStatus(row, now),
    registrationOpen: isRegistrationOpen(row, now),
  };
}

const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Events that have not ended yet, soonest first, optionally filtered. */
export async function listAvailable({ q, type, date }) {
  const now = localNow();
  const params = [now.date];
  const where = ['COALESCE(e.end_date, e.date) >= $1'];

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
    where.push(`$${params.length}::date BETWEEN e.date AND COALESCE(e.end_date, e.date)`);
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
                         max_participants, registration_deadline, image, organizer_name, organizer_contact,
                         requires_approval, end_date, team_enabled, min_team_size, max_team_size, allow_multiple_teams)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
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
      data.requiresApproval ?? false,
      data.endDate && data.endDate !== data.date ? data.endDate : null,
      data.teamEnabled ?? false,
      data.minTeamSize ?? 1,
      data.maxTeamSize ?? 4,
      data.allowMultipleTeams ?? false,
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
