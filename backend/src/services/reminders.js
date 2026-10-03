import QRCode from 'qrcode';
import { query } from '../db.js';
import { appLink, emailConfigured, queueEmail } from './email/index.js';
import { registrantsOf } from './email/broadcasts.js';
import { runVolunteerReminders } from './volunteerNotifications.js';
import * as notifications from '../models/notificationModel.js';
import { QR_PREFIX } from '../models/attendanceModel.js';
import { ATTENDABLE } from '../models/registrationModel.js';
import { getEventStatus, localNow } from '../utils/eventStatus.js';

const MINUTE = 60 * 1000;
const asDate = (date, time) => new Date(`${date}T${time}:00`); // local time, like the stored values

const clock = (time) => {
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

function untilText(minutes) {
  if (minutes < 60) return `in ${Math.max(minutes, 1)} minutes`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `in about ${hours} hour${hours === 1 ? '' : 's'}` : 'tomorrow';
}

/** Email the day-before reminder with the person's QR pass and, for online events, the meeting link. */
async function emailReminders(event, userIds) {
  if (!emailConfigured()) return;
  const wanted = new Set(userIds);
  for (const p of (await registrantsOf(event.id)).filter((r) => wanted.has(r.userId))) {
    const hasPass = ATTENDABLE.includes(p.status) && p.qrToken;
    let qr;
    try {
      qr = hasPass ? await QRCode.toBuffer(`${QR_PREFIX}${p.qrToken}`, { width: 360, margin: 2, errorCorrectionLevel: 'M' }) : null;
    } catch (err) {
      console.error('Could not draw the QR pass for a reminder:', err.message);
    }
    await queueEmail({
      to: p.email,
      template: 'eventReminder',
      userId: p.userId,
      category: 'reminders',
      data: { name: p.name, event, passUrl: hasPass ? appLink(`/my/registrations/${p.registrationId}/pass`) : appLink(`/events/${event.id}`), meetingUrl: event.mode !== 'offline' ? event.meetingUrl : null, qrCid: qr ? 'eventpass' : null },
      attachments: qr ? [{ filename: 'event-pass.png', content: qr, cid: 'eventpass' }] : undefined,
    });
  }
}

/**
 * Create event reminders (24 h and 1 h before the start) and "session starting soon" notices
 * (15 min before). Safe to call as often as you like: each notification is created once.
 * Returns how many notifications were created, for logging and tests.
 */
export async function runReminders(now = new Date()) {
  const local = localNow(now);
  const horizon = localNow(new Date(now.getTime() + 25 * 60 * MINUTE));
  let created = 0;

  const events = await query(
    `SELECT id, name, venue, mode, meeting_url AS "meetingUrl", to_char(date, 'YYYY-MM-DD') AS date, to_char(COALESCE(end_date, date), 'YYYY-MM-DD') AS "endDate",
            to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
       FROM events WHERE date BETWEEN $1::date AND $2::date`,
    [local.date, horizon.date],
  );
  for (const event of events) {
    const minutes = Math.ceil((asDate(event.date, event.startTime) - now) / MINUTE);
    if (minutes <= 0 || minutes > 24 * 60) continue;

    const soon = minutes <= 60;
    const notified = await notifications.notifyEventDetailed(event.id, {
      type: 'event_reminder',
      title: `Reminder: ${event.name}`,
      message: `${event.name} starts ${untilText(minutes)} (${clock(event.startTime)}).`,
      link: `/events/${event.id}`,
      dedupeKey: soon ? `event-1h:${event.id}` : `event-24h:${event.id}`,
    });
    created += notified.length;
    // The day-before reminder is emailed too, once per person (only the newly notified are emailed).
    if (!soon && notified.length) await emailReminders(event, notified);
  }

  // Ask for feedback once an event has finished (within the last 3 days), once per person.
  const recent = await query(
    `SELECT id, name, to_char(date, 'YYYY-MM-DD') AS date, to_char(COALESCE(end_date, date), 'YYYY-MM-DD') AS "endDate",
            to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
       FROM events WHERE COALESCE(end_date, date) BETWEEN ($1::date - 3) AND $1::date`,
    [local.date],
  );
  for (const event of recent) {
    if (getEventStatus(event, local) !== 'ended') continue;
    created += await notifications.notifyEvent(
      event.id,
      {
        type: 'feedback_request',
        title: `How was ${event.name}?`,
        message: `${event.name} has finished. Share your feedback to help the organizers.`,
        link: `/events/${event.id}`,
        dedupeKey: `feedback:${event.id}`,
      },
      { statuses: ATTENDABLE },
    );
  }

  const sessions = await query(
    `SELECT s.id, s.event_id AS "eventId", s.title, s.venue, s.session_type AS "sessionType",
            to_char(s.date, 'YYYY-MM-DD') AS date, to_char(s.start_time, 'HH24:MI') AS "startTime"
       FROM schedule_items s WHERE s.date BETWEEN $1::date AND $2::date AND s.session_type <> 'break'`,
    [local.date, horizon.date],
  );
  for (const session of sessions) {
    const minutes = Math.ceil((asDate(session.date, session.startTime) - now) / MINUTE);
    if (minutes <= 0 || minutes > 15) continue;
    created += await notifications.notifyEvent(
      session.eventId,
      {
        type: 'session_starting',
        title: `Starting soon: ${session.title}`,
        message: `${session.title} begins ${untilText(minutes)} at ${clock(session.startTime)}${session.venue ? ` in ${session.venue}` : ''}.`,
        link: `/events/${session.eventId}`,
        dedupeKey: `session:${session.id}`,
      },
      { statuses: ATTENDABLE },
    );
  }
  return created;
}

/** Start the background reminder loop. Returns a function that stops it. */
export function startReminderLoop(everyMs = 60 * 1000) {
  const tick = () =>
    runReminders()
      .then(() => runVolunteerReminders())
      .catch((err) => console.error('Reminder job failed:', err.message));
  tick();
  const timer = setInterval(tick, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
