import * as events from '../models/eventModel.js';
import { notFound } from '../utils/httpError.js';

export async function listEvents(req, res) {
  res.json({ events: await events.listAvailable(req.query) });
}

export async function listMyEvents(req, res) {
  res.json({ events: await events.listByOrganizer(req.user.id) });
}

export async function getEvent(req, res) {
  const event = Number.isInteger(Number(req.params.id)) ? await events.findById(Number(req.params.id)) : undefined;
  if (!event) throw notFound('Event not found');
  res.json({ event });
}

export async function createEvent(req, res) {
  const event = await events.createEvent(req.user.id, { ...req.body, image: req.file?.filename });
  res.status(201).json({ event });
}
