import { ROLES } from '../constants.js';
import * as events from '../models/eventModel.js';
import * as registrations from '../models/registrationModel.js';
import { notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

export async function listEvents(req, res) {
  res.json({ events: await events.listAvailable(req.query, req.user.id) });
}

export async function listMyEvents(req, res) {
  res.json({ events: await events.listByOrganizer(req.user.id) });
}

export async function getEvent(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'), req.user.id);
  if (!event) throw notFound('Event not found');

  // For participants also return their own registration, and remember that they looked.
  let registration = null;
  if (req.user.role === ROLES.PARTICIPANT) {
    [registration] = await Promise.all([
      registrations.findForUser(event.id, req.user.id),
      registrations.recordEventView(event.id, req.user.id),
    ]);
  }
  res.json({ event, registration: registration ?? null });
}

export async function favorite(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'));
  if (!event) throw notFound('Event not found');
  await events.setFavorite(req.user.id, event.id, req.method === 'POST');
  res.json({ favorite: req.method === 'POST' });
}

export async function createEvent(req, res) {
  const event = await events.createEvent(req.user.id, { ...req.body, image: req.file?.filename });
  res.status(201).json({ event });
}
