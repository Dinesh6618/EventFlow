import * as events from '../models/eventModel.js';
import * as feedback from '../models/feedbackModel.js';
import { requireEventAccess } from '../services/access.js';
import { notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** GET /events/:id/feedback/mine - what the caller can rate now and what they already sent. */
export async function mine(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'));
  if (!event) throw notFound('Event not found');
  res.json(await feedback.targetsFor(event, req.user.id));
}

/** PUT /events/:id/feedback - create or update; `sessionId` null rates the event itself. */
export async function save(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'));
  if (!event) throw notFound('Event not found');
  const { sessionId, ...data } = req.body;
  await feedback.save(event, req.user.id, sessionId, data);
  res.json(await feedback.targetsFor(event, req.user.id));
}

export async function summary(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  res.json(await feedback.summary(event));
}
