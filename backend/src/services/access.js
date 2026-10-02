import { ROLES } from '../constants.js';
import * as events from '../models/eventModel.js';
import * as registrations from '../models/registrationModel.js';
import * as staff from '../models/staffModel.js';
import { forbidden, notFound } from '../utils/httpError.js';

/**
 * Resolve how `user` relates to an event and enforce which capacities may use an endpoint.
 * `allowed` is a list of: 'organizer' (owns the event), 'volunteer', 'judge'.
 * Returns { event, capacity }. Always checked on the server, never only in the UI.
 */
export async function requireEventAccess(user, eventId, allowed = ['organizer']) {
  const event = await events.findById(eventId);
  if (!event) throw notFound('Event not found');

  let capacity = null;
  if (user.role === ROLES.ORGANIZER && event.organizerId === user.id) {
    capacity = 'organizer';
  } else if (user.role === ROLES.PARTICIPANT) {
    for (const staffRole of ['volunteer', 'judge']) {
      if (allowed.includes(staffRole) && (await staff.has(eventId, user.id, staffRole))) {
        capacity = staffRole;
        break;
      }
    }
  }

  if (!capacity || !allowed.includes(capacity)) throw forbidden('You do not have access to this event');
  return { event, capacity };
}

/**
 * Read access to an event's non-public data (criteria, leaderboard): the organizer, participants
 * holding a seat, and the event's volunteers and judges. Returns { event, capacity }.
 */
export async function requireEventViewer(user, eventId) {
  const event = await events.findById(eventId);
  if (!event) throw notFound('Event not found');

  if (user.role === ROLES.ORGANIZER) {
    if (event.organizerId === user.id) return { event, capacity: 'organizer' };
    throw forbidden('You do not have access to this event');
  }
  if (user.role === ROLES.PARTICIPANT) {
    for (const staffRole of ['judge', 'volunteer']) {
      if (await staff.has(eventId, user.id, staffRole)) return { event, capacity: staffRole };
    }
    const registration = await registrations.findForUser(eventId, user.id);
    if (registration && registrations.ACTIVE.includes(registration.status)) return { event, capacity: 'participant' };
  }
  throw forbidden('You do not have access to this event');
}
