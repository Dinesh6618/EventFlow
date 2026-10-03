import * as notifications from '../models/notificationModel.js';

// Notifications name the category and place, never the description: those can hold medical details.
const links = {
  participant: (id) => `/help/requests/${id}`,
  volunteer: (id) => `/volunteer/help/${id}`,
  organizer: (id) => `/organizer/help/${id}`,
};

const send = (userId, request, audience, { type, title, message, dedupeKey = null }) =>
  userId
    ? notifications.safely(() => notifications.notify(userId, { eventId: request.eventId, type, title, message, link: links[audience](request.id), dedupeKey }))
    : Promise.resolve();

const what = (r) => `${r.requestCode}: ${r.categoryName}${r.location ? ` at ${r.location}` : ''}`;
const words = (status) => status.replace('_', ' ');

export const toParticipant = (r, type, title, message) => send(r.participantId, r, 'participant', { type, title, message });
export const toVolunteer = (r, type, title, message) => send(r.assignedVolunteerId, r, 'volunteer', { type, title, message });
export const toOrganizer = (r, type, title, message, dedupeKey = null) => send(r.organizerId, r, 'organizer', { type, title, message, dedupeKey });

export const submitted = (r) => toParticipant(r, 'help_submitted', 'Help request received', `${r.requestCode} was sent to the event team. You can follow it under Help.`);
export const urgentCreated = (r) => toOrganizer(r, 'help_urgent', 'Urgent help request', `${what(r)}`, `help-urgent-${r.id}`);
export const acknowledged = (r) => toParticipant(r, 'help_acknowledged', 'Your request was seen', `The event team has acknowledged ${r.requestCode}.`);
export const assigned = (r) =>
  Promise.all([
    toParticipant(r, 'help_assigned', 'A responder is assigned', `Someone from the event team will help with ${r.requestCode}.`),
    toVolunteer(r, 'help_assigned', 'New help request for you', `${what(r)} (${r.priority} priority)`),
  ]);
export const statusChanged = (r) =>
  toParticipant(
    r,
    r.status === 'resolved' ? 'help_resolved' : 'help_status',
    r.status === 'resolved' ? 'Your request was resolved' : 'Help request update',
    r.status === 'resolved' ? `${r.requestCode} was marked resolved. Tell the event team if it is not.` : `${r.requestCode} is now ${words(r.status)}.`,
  );
export const responderUpdate = (r, message) => toParticipant(r, 'help_update', 'Update on your help request', message.length > 140 ? `${message.slice(0, 137)}...` : message);
export const priorityChanged = (r, from) => toVolunteer(r, 'help_priority', 'Priority changed', `${r.requestCode} moved from ${from} to ${r.priority} priority.`);
export const cancelled = (r) => toVolunteer(r, 'help_cancelled', 'Help request cancelled', `${r.requestCode} was cancelled by the participant.`);
export const escalated = (r, reason) => toOrganizer(r, 'help_escalation', 'Help request escalated', `${what(r)}. ${reason}`, `help-escalation-${r.id}`);
export const unresolved = (r, minutes) => toOrganizer(r, 'help_unresolved', 'Help request still open', `${what(r)} has been open for ${minutes} minutes.`, `help-unresolved-${r.id}`);
