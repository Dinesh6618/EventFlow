import * as events from '../models/eventModel.js';
import * as notifications from '../models/notificationModel.js';
import * as registrations from '../models/registrationModel.js';
import { ROLES } from '../constants.js';
import { toCsv } from '../utils/csv.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** POST /events/:id/registrations - a participant registers for an event. */
export async function register(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  registrations.assertProfileComplete(req.user);

  const { id } = await registrations.register(eventId, req.user.id);
  const [registration, event] = await Promise.all([registrations.findById(id), events.findById(eventId)]);

  await notifications.safely(async () => {
    const pending = registration.status === 'pending';
    await notifications.notify(req.user.id, {
      eventId,
      type: pending ? 'registration_pending' : 'registration_confirmed',
      title: pending ? 'Registration received' : 'Registration confirmed',
      message: pending
        ? `Your registration for ${event.name} is waiting for the organizer's approval.`
        : `You are registered for ${event.name}. Your participant ID is ${registration.participantCode}.`,
      link: `/events/${eventId}`,
    });
    if (pending) {
      await notifications.notify(event.organizerId, {
        eventId,
        type: 'new_registration',
        title: 'New registration to review',
        message: `${req.user.name} registered for ${event.name} and needs your approval.`,
        link: `/organizer/participants?eventId=${eventId}`,
      });
    }
  });
  res.status(201).json({ registration, event });
}

/** POST /registrations/:id/cancel */
export async function cancel(req, res) {
  const { id, eventId } = await registrations.cancel(idParam(req.params.id, 'Registration'), req.user.id);
  const [registration, event] = await Promise.all([registrations.findById(id), events.findById(eventId)]);
  res.json({ registration, event });
}

/** GET /registrations/mine - upcoming and past registrations of the signed-in participant. */
export async function mine(req, res) {
  res.json({ registrations: await registrations.listForUser(req.user.id) });
}

/** PATCH /registrations/:id/status - organizer approves or rejects. */
export async function decide(req, res) {
  const result = await registrations.decide(idParam(req.params.id, 'Registration'), req.user.id, req.body.status);
  const event = await events.findById(result.eventId);
  const approved = result.status === 'approved';
  await notifications.safely(() =>
    notifications.notify(result.userId, {
      eventId: result.eventId,
      type: approved ? 'registration_approved' : 'registration_rejected',
      title: approved ? 'Registration approved' : 'Registration declined',
      message: approved
        ? `The organizer approved your registration for ${event.name}.`
        : `The organizer declined your registration for ${event.name}.`,
      link: `/events/${result.eventId}`,
    }),
  );
  res.json({ registration: await registrations.findById(result.id) });
}

/** GET /registrations/:id - the organizer of the event sees participant details; the owner sees their own. */
export async function detail(req, res) {
  const id = idParam(req.params.id, 'Registration');
  if (req.user.role === ROLES.ORGANIZER) {
    const found = await registrations.detailForOrganizer(req.user.id, id);
    if (!found) throw notFound('Registration not found');
    return res.json({ registration: found });
  }
  const found = await registrations.findById(id);
  if (!found || found.userId !== req.user.id) throw notFound('Registration not found');
  res.json({ registration: found });
}

/** GET /organizer/participants */
export async function listParticipants(req, res) {
  const { page, pageSize, ...filters } = req.query;
  const [{ registrations: rows, total }, options] = await Promise.all([
    registrations.listForOrganizer(req.user.id, filters, { limit: pageSize, offset: (page - 1) * pageSize }),
    registrations.filterOptions(req.user.id),
  ]);
  res.json({ registrations: rows, total, page, pageSize, ...options });
}

/** GET /organizer/participants/export - same filters as the list, as a CSV download. */
export async function exportParticipants(req, res) {
  const { page: _page, pageSize: _size, ...filters } = req.query;
  if (filters.eventId && !(await ownsEvent(req.user.id, filters.eventId))) throw forbidden();

  const { registrations: rows } = await registrations.listForOrganizer(req.user.id, filters, null);
  const csv = toCsv(rows, [
    { header: 'Participant ID', value: (r) => r.participantCode },
    { header: 'Name', value: (r) => r.participantName },
    { header: 'Email', value: (r) => r.email },
    { header: 'Department', value: (r) => r.department },
    { header: 'College', value: (r) => r.college },
    { header: 'Event', value: (r) => r.eventName },
    { header: 'Status', value: (r) => r.status },
    { header: 'Registered at', value: (r) => r.registeredAt },
  ]);
  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="participants.csv"')
    .send(csv);
}

async function ownsEvent(organizerId, eventId) {
  const event = await events.findById(eventId);
  return event?.organizerId === organizerId;
}
