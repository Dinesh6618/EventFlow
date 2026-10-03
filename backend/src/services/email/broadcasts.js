import { config } from '../../config.js';
import { query } from '../../db.js';
import { ACTIVE } from '../../models/registrationModel.js';
import { appLink, emailConfigured, queueEmail } from './index.js';

/** People holding a registration for an event, with what an email to them needs. */
export const registrantsOf = (eventId, statuses = ACTIVE) =>
  query(
    `SELECT r.id AS "registrationId", r.status, r.qr_token AS "qrToken", r.participant_code AS "participantCode", u.id AS "userId", u.name, u.email
       FROM registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = $1 AND r.status = ANY($2) ORDER BY r.id`,
    [eventId, statuses],
  );

/** Queue one email to every registrant. `data` is built per person. Returns how many were queued. */
export async function emailRegistrants(eventId, template, data, { category, statuses } = {}) {
  if (!emailConfigured()) return 0;
  const people = await registrantsOf(eventId, statuses);
  let queued = 0;
  for (const p of people) {
    const result = await queueEmail({ to: p.email, template, data: data(p), userId: p.userId, category });
    if (result.queued) queued += 1;
  }
  return queued;
}

/* ------------------------------------------------ schedule changes, batched */

// An organizer fixing a timetable makes many changes in a row. Everyone gets one email listing them,
// sent a couple of minutes after the first change, instead of one email per edit.
const pending = new Map(); // eventId -> { event, changes, timer }

/** Flush the batch for an event right now. Returns how many emails were queued. */
export async function flushScheduleChanges(eventId) {
  const entry = pending.get(eventId);
  if (!entry) return 0;
  clearTimeout(entry.timer);
  pending.delete(eventId);
  const changes = [...new Set(entry.changes)];
  return emailRegistrants(
    eventId,
    'scheduleChanged',
    (p) => ({ name: p.name, eventName: entry.event.name, changes, eventUrl: appLink(`/events/${eventId}`) }),
    { category: 'announcements' },
  );
}

export function queueScheduleChange(event, message) {
  if (!emailConfigured()) return;
  const entry = pending.get(event.id) ?? { event, changes: [], timer: null };
  entry.changes.push(message);
  if (!entry.timer) {
    entry.timer = setTimeout(() => flushScheduleChanges(event.id).catch((err) => console.error('Schedule change email failed:', err.message)), config.email.scheduleDigestMs);
    entry.timer.unref?.();
  }
  pending.set(event.id, entry);
}
