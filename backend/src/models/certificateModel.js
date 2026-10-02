import { query, transaction } from '../db.js';
import * as judging from './judgingModel.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const TYPES = ['participant', 'winner', 'runner_up', 'finalist', 'volunteer', 'organizer', 'speaker', 'judge'];

export const TYPE_LABELS = {
  participant: 'Participant',
  winner: 'Winner',
  runner_up: 'Runner-up',
  finalist: 'Finalist',
  volunteer: 'Volunteer',
  organizer: 'Organizer',
  speaker: 'Speaker',
  judge: 'Judge',
};

const COLUMNS = `
  c.id, c.certificate_code AS "code", c.event_id AS "eventId", c.user_id AS "userId",
  c.recipient_name AS "recipientName", c.type, c.issued_at AS "issuedAt",
  c.revoked_at AS "revokedAt", c.revoked_reason AS "revokedReason"`;

const keyFor = ({ userId, name }) => (userId ? `u:${userId}` : `n:${name.trim().toLowerCase()}`);

/* ------------------------------------------------------ who is eligible */

/** People entitled to a certificate of `type` for this event: [{ userId, name }]. */
async function candidates(event, type, options = {}) {
  switch (type) {
    case 'participant':
      return options.scope === 'registered'
        ? query(
            `SELECT u.id AS "userId", u.name FROM registrations r JOIN users u ON u.id = r.user_id
              WHERE r.event_id = $1 AND r.status IN ('approved', 'confirmed') ORDER BY u.name`,
            [event.id],
          )
        : query(
            `SELECT u.id AS "userId", u.name FROM attendance a JOIN users u ON u.id = a.user_id WHERE a.event_id = $1 ORDER BY u.name`,
            [event.id],
          );
    case 'volunteer':
    case 'judge':
      return query(
        `SELECT u.id AS "userId", u.name FROM event_staff s JOIN users u ON u.id = s.user_id
          WHERE s.event_id = $1 AND s.staff_role = $2 ORDER BY u.name`,
        [event.id, type],
      );
    case 'organizer':
      return query(`SELECT id AS "userId", name FROM users WHERE id = $1`, [event.organizerId]);
    case 'winner':
    case 'runner_up':
    case 'finalist': {
      const { rows } = await judging.leaderboard(event.id);
      const finalistLast = options.finalistUpToRank ?? 5;
      const wanted = rows.filter((r) => r.rank !== null && (type === 'winner' ? r.rank === 1 : type === 'runner_up' ? r.rank === 2 : r.rank >= 3 && r.rank <= finalistLast));
      if (wanted.length === 0) return [];
      return query(
        `SELECT DISTINCT u.id AS "userId", u.name FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ANY($1) ORDER BY u.name`,
        [wanted.map((r) => r.teamId)],
      );
    }
    default:
      return []; // 'speaker' is issued by name
  }
}

async function alreadyIssued(eventId, type) {
  const rows = await query(`SELECT recipient_key AS key FROM certificates WHERE event_id = $1 AND type = $2`, [eventId, type]);
  return new Set(rows.map((r) => r.key));
}

/** For each automatic type: how many people would receive a new certificate right now. */
export async function eligibility(event, options = {}) {
  const result = {};
  for (const type of TYPES.filter((t) => t !== 'speaker')) {
    const have = await alreadyIssued(event.id, type);
    const people = await candidates(event, type, options);
    result[type] = { eligible: people.filter((p) => !have.has(keyFor(p))).length, issued: have.size };
  }
  const speakers = await query(
    `SELECT DISTINCT speaker FROM schedule_items WHERE event_id = $1 AND speaker <> '' ORDER BY speaker`,
    [event.id],
  );
  const issuedSpeakers = await alreadyIssued(event.id, 'speaker');
  result.speaker = { eligible: 0, issued: issuedSpeakers.size, suggestions: speakers.map((s) => s.speaker).filter((s) => !issuedSpeakers.has(`n:${s.toLowerCase()}`)) };
  return result;
}

/* --------------------------------------------------------------- issuing */

function assertCanIssue(event) {
  if (event.status === 'upcoming') throw conflict('Certificates can be issued once the event has started');
}

async function insertCertificates(run, event, type, people, issuerId) {
  const issued = [];
  for (const person of people) {
    const rows = await run(
      `INSERT INTO certificates (certificate_code, event_id, user_id, recipient_name, recipient_key, type, issued_by)
       VALUES ('EVF-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('certificate_seq')::text, 6, '0'), $1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, type, recipient_key) DO NOTHING RETURNING id, user_id AS "userId", certificate_code AS code`,
      [event.id, person.userId ?? null, person.name, keyFor(person), type, issuerId],
    );
    if (rows[0]) issued.push(rows[0]);
  }
  return issued;
}

/** Issue to everyone eligible for `type` who does not have one yet. Returns the new certificates. */
export async function issueBulk(event, type, issuerId, options = {}) {
  assertCanIssue(event);
  if (type === 'speaker') throw unprocessable('Speakers are issued by name', { type: 'Use the speaker form' });
  const everyone = await candidates(event, type, options);
  if (everyone.length === 0) {
    throw conflict(
      type === 'winner' || type === 'runner_up' || type === 'finalist'
        ? 'No team is ranked for this yet. Judges need to submit scores first.'
        : 'There is nobody eligible for this certificate yet',
    );
  }
  const have = await alreadyIssued(event.id, type);
  const people = everyone.filter((p) => !have.has(keyFor(p)));
  if (people.length === 0) throw conflict('Everyone eligible already has this certificate');
  return transaction((run) => insertCertificates(run, event, type, people, issuerId));
}

/** Issue to named people (any type). A recipient with an account email is linked to that account. */
export async function issueManual(event, type, recipients, issuerId) {
  assertCanIssue(event);
  const people = [];
  for (const r of recipients) {
    let userId = null;
    let name = r.name.trim();
    if (r.email) {
      const user = (await query(`SELECT id, name FROM users WHERE email = $1`, [r.email.toLowerCase()]))[0];
      if (!user) throw unprocessable('Please fix the highlighted fields', { email: `No account uses ${r.email}. Leave the email empty to issue by name only.` });
      userId = user.id;
      name = name || user.name;
    }
    people.push({ userId, name });
  }
  const issued = await transaction((run) => insertCertificates(run, event, type, people, issuerId));
  if (issued.length === 0) throw conflict('That person already has this certificate');
  return issued;
}

export async function revoke(eventId, id, reason) {
  const found = (await query(`SELECT revoked_at AS "revokedAt" FROM certificates WHERE id = $1 AND event_id = $2`, [id, eventId]))[0];
  if (!found) throw notFound('Certificate not found');
  if (found.revokedAt) throw conflict('This certificate was already revoked');
  await query(`UPDATE certificates SET revoked_at = NOW(), revoked_reason = $3 WHERE id = $1 AND event_id = $2`, [id, eventId, reason]);
}

/* --------------------------------------------------------------- reading */

export async function listForEvent(eventId) {
  return query(`SELECT ${COLUMNS} FROM certificates c WHERE c.event_id = $1 ORDER BY c.id DESC`, [eventId]);
}

export async function listForUser(userId) {
  return query(
    `SELECT ${COLUMNS}, e.name AS "eventName", e.type AS "eventType", e.image AS "eventImage", to_char(e.date, 'YYYY-MM-DD') AS "eventDate"
       FROM certificates c JOIN events e ON e.id = c.event_id
      WHERE c.user_id = $1 AND c.revoked_at IS NULL ORDER BY c.issued_at DESC`,
    [userId],
  );
}

/** Everything the PDF needs. */
export async function findForPdf(code) {
  const rows = await query(
    `SELECT ${COLUMNS}, e.name AS "eventName", e.type AS "eventType", e.venue,
            to_char(e.date, 'YYYY-MM-DD') AS "eventDate", to_char(COALESCE(e.end_date, e.date), 'YYYY-MM-DD') AS "eventEndDate",
            e.organizer_id AS "organizerId", e.organizer_name AS "organizerName", e.organizer_contact AS "organizerContact"
       FROM certificates c JOIN events e ON e.id = c.event_id WHERE c.certificate_code = $1`,
    [code],
  );
  return rows[0];
}

/**
 * Public verification. Reveals only what is needed to confirm a certificate is genuine:
 * status, holder's name, event, type and issue date. No email, no account details.
 */
export async function verify(code) {
  const found = await findForPdf(code);
  if (!found) return { status: 'NOT_FOUND', valid: false };
  return {
    status: found.revokedAt ? 'REVOKED' : 'VALID',
    valid: !found.revokedAt,
    certificate: {
      code: found.code,
      participantName: found.recipientName,
      eventName: found.eventName,
      type: found.type,
      typeLabel: TYPE_LABELS[found.type],
      issuedAt: found.issuedAt,
      organizer: found.organizerName,
    },
  };
}

export const CODE_PATTERN = /^EVF-\d{4}-\d{6}$/;
