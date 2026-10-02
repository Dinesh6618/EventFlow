import * as events from '../models/eventModel.js';
import * as notifications from '../models/notificationModel.js';
import * as schedule from '../models/scheduleModel.js';
import { requireEventAccess } from '../services/access.js';
import { notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** GET /events/:id/schedule - any signed-in user (schedules are part of the public event page). */
export async function list(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'));
  if (!event) throw notFound('Event not found');
  const items = await schedule.list(event.id);
  res.json({ items, ...schedule.snapshot(items) });
}

/** Tell registered participants the schedule changed (never blocks or fails the request). */
function announceChange(event, message) {
  if (event.status === 'ended') return Promise.resolve();
  return notifications.safely(() =>
    notifications.notifyEvent(event.id, {
      type: 'schedule_change',
      title: 'Schedule updated',
      message: `${message} (${event.name})`,
      link: `/events/${event.id}`,
    }),
  );
}

export async function create(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  const item = await schedule.create(event, req.body);
  await announceChange(event, `"${item.title}" was added`);
  res.status(201).json({ item });
}

export async function update(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  const item = await schedule.update(event, idParam(req.params.itemId, 'Session'), req.body);
  await announceChange(event, `"${item.title}" was changed`);
  res.json({ item });
}

export async function remove(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  const removed = await schedule.remove(event.id, idParam(req.params.itemId, 'Session'));
  await announceChange(event, `"${removed.title}" was removed`);
  res.status(204).end();
}

/** GET /me/schedule/today - today's sessions for the events a participant has a seat in. */
export async function myToday(req, res) {
  res.json({ items: await schedule.todayForUser(req.user.id) });
}
