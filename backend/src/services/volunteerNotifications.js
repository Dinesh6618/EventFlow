import { query } from '../db.js';
import * as notifications from '../models/notificationModel.js';
import { LIVE, getSettings, minutesOfDay } from '../models/volunteerOpsModel.js';
import { localNow } from '../utils/eventStatus.js';

// Everything goes through the existing notification system. Volunteers land on their dashboard;
// organizers land on the page where they can act.
const send = (userId, eventId, link, { type, title, message, dedupeKey = null }) =>
  userId ? notifications.safely(() => notifications.notify(userId, { eventId, type, title, message, link, dedupeKey })) : Promise.resolve();

const toVolunteer = (userId, eventId, n, link = '/volunteer') => send(userId, eventId, link, n);
const toOrganizer = (a, n, path = 'assignments') => send(a.organizerId, a.eventId, `/organizer/events/${a.eventId}/volunteers/${path}`, n);

const when = (a) => `${a.date} ${a.startTime}-${a.endTime}${a.location ? ` at ${a.location}` : ''}`;

export const assigned = (a) => toVolunteer(a.userId, a.eventId, { type: 'volunteer_assigned', title: 'New volunteer assignment', message: `${a.departmentName} for ${a.eventName}: ${when(a)}. Please accept it.` });
export const changed = (a, previousUserId) =>
  Promise.all([
    toVolunteer(a.userId, a.eventId, { type: 'volunteer_assignment_changed', title: 'Your assignment changed', message: `${a.departmentName} for ${a.eventName} is now ${when(a)}. Please accept it again.` }),
    previousUserId && previousUserId !== a.userId
      ? toVolunteer(previousUserId, a.eventId, { type: 'volunteer_assignment_removed', title: 'You were taken off an assignment', message: `You no longer have the ${a.departmentName} duty for ${a.eventName} on ${a.date}.` })
      : Promise.resolve(),
  ]);
export const removed = (a) => toVolunteer(a.userId, a.eventId, { type: 'volunteer_assignment_removed', title: 'Assignment removed', message: `The ${a.departmentName} duty for ${a.eventName} on ${a.date} ${a.startTime}-${a.endTime} was removed.` });
export const accepted = (a) => toOrganizer(a, { type: 'volunteer_accepted', title: 'Assignment accepted', message: `${a.volunteerName} accepted ${a.departmentName} (${a.date} ${a.startTime}-${a.endTime}).` });

export const taskAssigned = (t) => toVolunteer(t.userId, t.eventId, { type: 'volunteer_task', title: 'New task for you', message: `${t.title} (${t.departmentName}, ${t.priority} priority) ${t.date} ${t.startTime}-${t.endTime}${t.location ? ` at ${t.location}` : ''}.` }, '/volunteer/tasks');
export const taskChanged = (t, previousUserId) =>
  Promise.all([
    toVolunteer(t.userId, t.eventId, { type: 'volunteer_task_changed', title: t.status === 'cancelled' ? 'Task cancelled' : 'A task changed', message: `${t.title} (${t.departmentName}): ${t.status === 'cancelled' ? 'cancelled' : `${t.date} ${t.startTime}-${t.endTime}`}.` }, '/volunteer/tasks'),
    previousUserId && previousUserId !== t.userId ? toVolunteer(previousUserId, t.eventId, { type: 'volunteer_task_changed', title: 'Task reassigned', message: `${t.title} was given to someone else.` }, '/volunteer/tasks') : Promise.resolve(),
  ]);
export const taskDone = (t) => send(t.organizerId, t.eventId, `/organizer/events/${t.eventId}/volunteers/tasks`, { type: 'volunteer_task_done', title: 'Task completed', message: `${t.volunteerName} completed "${t.title}".` });

export const announcement = (userIds, event, a) => Promise.all(userIds.map((id) => toVolunteer(id, event.id, { type: 'volunteer_announcement', title: a.title, message: a.message.length > 140 ? `${a.message.slice(0, 137)}...` : a.message })));

export const reassignmentRequested = (a, reason) => toOrganizer(a, { type: 'volunteer_reassignment_request', title: 'Reassignment requested', message: `${a.volunteerName} asked to leave ${a.departmentName}: ${reason}` });
export const reassignmentDecided = (request, event) =>
  toVolunteer(request.userId, request.eventId, {
    type: 'volunteer_reassignment',
    title: request.status === 'approved' ? 'Reassignment approved' : 'Reassignment not approved',
    message: request.status === 'approved' ? `You were released from ${request.departmentName} on ${request.date}. The organizer may assign you elsewhere.` : `Your request to leave ${request.departmentName} on ${request.date} was not approved${request.reviewNote ? `: ${request.reviewNote}` : '.'}`,
  });

export const lateCheckIn = (a) => toOrganizer(a, { type: 'volunteer_late', title: 'Volunteer checked in late', message: `${a.volunteerName} checked in late for ${a.departmentName}.` }, 'attendance');

/**
 * "Your shift starts soon". Runs with the other reminders: once per duty, to volunteers who still hold
 * it, when it begins within the configured number of minutes.
 */
export async function runVolunteerReminders(now = new Date()) {
  const local = localNow(now);
  const { shiftReminderMinutes } = await getSettings();
  const rows = await query(
    `SELECT a.id, a.event_id AS "eventId", a.user_id AS "userId", e.name AS "eventName", d.name AS "departmentName",
            to_char(a.start_time, 'HH24:MI') AS "startTime", to_char(a.end_time, 'HH24:MI') AS "endTime", a.location
       FROM volunteer_assignments a JOIN events e ON e.id = a.event_id JOIN volunteer_departments d ON d.id = a.department_id
       LEFT JOIN volunteer_attendance t ON t.assignment_id = a.id
      WHERE a.date = $1::date AND a.status = ANY($2) AND t.id IS NULL`,
    [local.date, LIVE],
  );
  let sent = 0;
  for (const a of rows) {
    const minutes = minutesOfDay(a.startTime) - minutesOfDay(local.time);
    if (minutes < 0 || minutes > shiftReminderMinutes) continue;
    const created = await notifications.notify(a.userId, {
      eventId: a.eventId, type: 'volunteer_shift_reminder', title: 'Your shift starts soon',
      message: `${a.departmentName} at ${a.eventName} starts ${minutes <= 0 ? 'now' : `in ${minutes} min`} (${a.startTime})${a.location ? ` at ${a.location}` : ''}.`,
      link: '/volunteer', dedupeKey: `vshift-${a.id}`,
    });
    sent += created;
  }
  return sent;
}
