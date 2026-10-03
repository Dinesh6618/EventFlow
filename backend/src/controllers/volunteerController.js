import * as events from '../models/eventModel.js';
import * as notifications from '../models/notificationModel.js';
import * as volunteers from '../models/volunteerModel.js';
import { requireEventAccess } from '../services/access.js';
import { conflict, notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** GET /volunteer/opportunities - every event still to come or running, with my application status. */
export async function opportunities(req, res) {
  res.json({ opportunities: await volunteers.opportunities(req.user.id) });
}

export async function apply(req, res) {
  const event = await events.findById(idParam(req.params.id, 'Event'));
  if (!event) throw notFound('Event not found');
  if (event.status === 'ended') throw conflict('This event has already ended');
  await volunteers.apply(event, req.user.id, req.body.message);
  await notifications.safely(() =>
    notifications.notify(event.organizerId, {
      eventId: event.id,
      type: 'volunteer_application',
      title: 'New volunteer application',
      message: `${req.user.name} offered to volunteer at ${event.name}.`,
      link: `/organizer/events/${event.id}/staff`,
    }),
  );
  res.status(201).json({ ok: true });
}

export async function withdraw(req, res) {
  await volunteers.withdraw(idParam(req.params.id, 'Event'), req.user.id);
  res.status(204).end();
}

export async function listForEvent(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  res.json({ applications: await volunteers.listForEvent(eventId) });
}

export async function decide(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  const { event } = await requireEventAccess(req.user, eventId, ['organizer']);
  const id = idParam(req.params.appId, 'Application');
  const decided = await volunteers.decide(eventId, id, req.body.status, req.user.id);
  if (!decided) {
    if (!(await volunteers.find(eventId, id))) throw notFound('Application not found');
    throw conflict('This application was already decided');
  }
  const approved = decided.status === 'approved';
  await notifications.safely(() =>
    notifications.notify(decided.userId, {
      eventId,
      type: 'volunteer_decision',
      title: approved ? 'You are a volunteer!' : 'Volunteer application update',
      message: approved ? `You were approved as a volunteer for ${event.name}.` : `Your volunteer application for ${event.name} was not accepted this time.`,
      link: approved ? `/volunteer/events/${eventId}` : '/volunteer',
    }),
  );
  res.json({ application: decided });
}
