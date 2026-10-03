import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import * as events from '../models/eventModel.js';
import * as help from '../models/helpModel.js';
import * as registrations from '../models/registrationModel.js';
import * as staff from '../models/staffModel.js';
import { requireEventAccess, requireEventViewer } from '../services/access.js';
import * as alerts from '../services/helpNotifications.js';
import { capabilities, timelineDto, toDto, viewerOf } from '../services/helpAccess.js';
import { isEventDay } from '../utils/eventStatus.js';
import { conflict, forbidden, notFound, unprocessable } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** Help can be asked for on the day of the event (or while it runs). Contacts follow the same window. */
export const helpWindowOpen = (event) => event.status === 'ongoing' || isEventDay(event);

/** Load a request and how the caller relates to it. People with no stake get a 404, so ids cannot be probed. */
async function loadFor(req) {
  const request = await help.find(idParam(req.params.id, 'Help request'));
  const viewer = request ? await viewerOf(req.user, request) : null;
  if (!viewer) throw notFound('Help request not found');
  return { request, viewer };
}

async function detail(request, viewer, user) {
  const settings = await help.escalationSettings();
  const dto = await toDto(request, viewer, { settings });
  const staffView = viewer === 'organizer' || viewer === 'volunteer';
  let rows = await help.updates(request.id, { staff: staffView || viewer === 'admin' });
  if (viewer === 'admin') rows = rows.filter((r) => ['status', 'assignment', 'priority', 'escalation', 'created'].includes(r.kind));
  return {
    request: dto,
    timeline: timelineDto(rows, viewer, user.id),
    attachments: viewer === 'admin' ? [] : await help.attachments(request.id),
    responders: dto.capabilities.canAssign ? await help.responders(request.eventId) : undefined,
  };
}

const respond = async (res, requestId, viewer, user, status = 200) => {
  const fresh = await help.find(requestId);
  res.status(status).json(await detail(fresh, viewer, user));
};

/* ------------------------------------------------------------ participant */

/** Everything the Help Center screen needs in one call. */
export async function info(req, res) {
  const { event, capacity } = await requireEventViewer(req.user, idParam(req.params.eventId, 'Event'));
  const open = helpWindowOpen(event);
  const seat = await registrations.findForUser(event.id, req.user.id);
  const hasSeat = Boolean(seat && registrations.ACTIVE.includes(seat.status));
  const staffView = capacity === 'organizer' || capacity === 'volunteer';
  const [categories, locations, contacts, mine] = await Promise.all([
    help.listCategories(),
    help.locations(event),
    open || staffView ? help.contactsForEvent(event.id) : [],
    hasSeat ? help.countActiveForUser(event.id, req.user.id) : 0,
  ]);
  res.json({
    event: { id: event.id, name: event.name, venue: event.venue, date: event.date, endDate: event.endDate, status: event.status },
    windowOpen: open,
    canRequest: req.user.role === 'participant' && hasSeat && open,
    reason: !hasSeat ? 'Register for this event to ask for help.' : !open ? 'Help requests open on the day of the event.' : null,
    openRequests: mine,
    maxOpen: config.help.maxOpenPerEvent,
    categories,
    locations,
    contacts: contacts.map(({ eventId, eventName, ...c }) => c),
  });
}

export async function create(req, res) {
  const discard = () => req.file && fs.rmSync(req.file.path, { force: true });
  try {
    const event = await events.findById(idParam(req.params.eventId, 'Event'));
    if (!event) throw notFound('Event not found');
    const seat = await registrations.findForUser(event.id, req.user.id);
    if (!seat || !registrations.ACTIVE.includes(seat.status)) throw forbidden('Register for this event to ask for help');
    if (!helpWindowOpen(event)) throw conflict('Help requests open on the day of the event');

    const body = req.body;
    const category = await help.findCategory(body.categoryId);
    if (!category || !category.isActive) throw unprocessable('Please fix the highlighted fields', { categoryId: 'Choose what you need help with' });

    // The priority comes from the category, never from the participant. Urgent ones need an explicit confirmation.
    const errors = {};
    if (category.isUrgent && !body.confirmUrgent) errors.confirmUrgent = 'Confirm that this needs immediate attention';
    let details = {};
    if (category.code === 'lost_found') {
      if (!body.lostFoundKind) errors.lostFoundKind = 'Choose lost or found';
      if (!body.itemName) errors.itemName = 'Name the item';
      details = { kind: body.lostFoundKind, itemName: body.itemName, ...(body.itemWhen && { when: body.itemWhen }) };
    } else if (!category.isUrgent && body.description.length < 3) {
      errors.description = 'Describe the problem in a few words';
    }
    if (Object.keys(errors).length) throw unprocessable('Please fix the highlighted fields', errors);

    const open = await help.countActiveForUser(event.id, req.user.id);
    if (open >= config.help.maxOpenPerEvent) {
      throw conflict(`You already have ${open} open requests for this event. Wait for a response, or cancel one you no longer need.`);
    }

    const id = await help.create({ event, userId: req.user.id, category, description: body.description, location: body.location, contactPreference: body.contactPreference, details });
    if (req.file) await help.addAttachment(id, req.file);
    const request = await help.find(id);
    await alerts.submitted(request);
    if (request.priority === 'urgent') await alerts.urgentCreated(request);
    await respond(res, id, 'participant', req.user, 201);
  } catch (err) {
    discard();
    throw err;
  }
}

export async function mine(req, res) {
  const eventId = req.params.eventId ? idParam(req.params.eventId, 'Event') : null;
  const rows = await help.listForParticipant(req.user.id, eventId);
  res.json({ requests: await Promise.all(rows.map((r) => toDto(r, 'participant'))) });
}

export async function get(req, res) {
  const { request, viewer } = await loadFor(req);
  res.json(await detail(request, viewer, req.user));
}

export async function cancel(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer !== 'participant') throw forbidden('Only the person who asked for help can cancel it');
  const updated = await help.transition(request.id, 'cancelled', req.user.id, 'Cancelled by the participant');
  if (!updated) throw conflict('Work has already started on this request, so it can no longer be cancelled. Tell the responder instead.');
  await alerts.cancelled(updated);
  await respond(res, request.id, viewer, req.user);
}

/** The photo, only for people allowed to see the request. Never served from a public folder. */
export async function attachment(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer === 'admin') throw forbidden('Photos are only visible to the person who asked and the event staff');
  const file = await help.findAttachment(request.id, idParam(req.params.attId, 'Attachment'));
  if (!file) throw notFound('Attachment not found');
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }).type(file.type).sendFile(path.resolve(config.helpUploadDir, file.storedName));
}

/* ------------------------------------------------------ volunteer / staff */

/** Requests an event volunteer has been handed. Only those, and only while they are still a volunteer. */
export async function volunteerList(req, res) {
  const assignments = await staff.assignmentsForUser(req.user.id);
  const volunteerAt = new Set(assignments.filter((a) => a.staffRole === 'volunteer').map((a) => a.eventId));
  const rows = (await help.listForVolunteer(req.user.id)).filter((r) => volunteerAt.has(r.eventId));
  res.json({ requests: await Promise.all(rows.map((r) => toDto(r, 'volunteer'))) });
}

export async function accept(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer !== 'volunteer') throw forbidden('Only the assigned volunteer can accept this request');
  const updated = await help.accept(request.id, req.user.id);
  if (!updated) throw conflict('This request cannot be accepted right now');
  await alerts.responderUpdate(updated, 'The responder accepted your request and is on it.');
  await respond(res, request.id, viewer, req.user);
}

const STATUS_RIGHTS = { organizer: ['acknowledged', 'in_progress', 'resolved', 'closed'], volunteer: ['in_progress', 'resolved'] };

export async function setStatus(req, res) {
  const { request, viewer } = await loadFor(req);
  const { status, message } = req.body;
  if (!STATUS_RIGHTS[viewer]?.includes(status)) throw forbidden('You cannot set that status on this request');
  const updated = await help.transition(request.id, status, req.user.id, message);
  if (!updated) throw conflict(`This request is ${request.status.replace('_', ' ')}, so it cannot be moved to ${status.replace('_', ' ')}`);
  if (status === 'acknowledged') await alerts.acknowledged(updated);
  else if (status !== 'closed') await alerts.statusChanged(updated);
  await respond(res, request.id, viewer, req.user);
}

export async function addUpdate(req, res) {
  const { request, viewer } = await loadFor(req);
  if (!['organizer', 'volunteer'].includes(viewer)) throw forbidden('Only the event team can post updates');
  if (!capabilities(request, viewer).canUpdate) throw conflict('This request is finished, so updates can no longer be added');
  await help.addUpdate(request.id, req.user.id, req.body.message, { internal: req.body.internal });
  if (!req.body.internal) await alerts.responderUpdate(request, req.body.message);
  await respond(res, request.id, viewer, req.user, 201);
}

export async function setItemStatus(req, res) {
  const { request, viewer } = await loadFor(req);
  if (!['organizer', 'volunteer'].includes(viewer)) throw forbidden('Only the event team can update a lost or found item');
  if (request.itemStatus === null) throw unprocessable('Please fix the highlighted fields', { itemStatus: 'Only Lost & Found requests have an item status' });
  const updated = await help.setItemStatus(request.id, req.body.itemStatus, req.user.id);
  if (!updated) throw conflict('Could not update the item');
  await alerts.responderUpdate(updated, `Your item is now marked ${req.body.itemStatus}.`);
  await respond(res, request.id, viewer, req.user);
}

/* -------------------------------------------------------------- organizer */

export async function organizerList(req, res) {
  const eventId = idParam(req.params.eventId, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  const settings = await help.escalationSettings();
  const [rows, summary, responders, categories] = await Promise.all([
    help.listFiltered({ ...req.query, eventId }),
    help.summary({ eventId }),
    help.responders(eventId),
    help.listCategories({ all: true }),
  ]);
  res.json({
    summary,
    requests: await Promise.all(rows.map((r) => toDto(r, 'organizer', { settings }))),
    responders,
    categories: categories.map(({ id, code, name, icon }) => ({ id, code, name, icon })),
    settings,
  });
}

export async function organizerSummary(req, res) {
  const [summary, urgent] = await Promise.all([
    help.summary({ organizerId: req.user.id }),
    help.listFiltered({ organizerId: req.user.id, state: 'active', priority: 'urgent' }, { limit: 3 }),
  ]);
  res.json({
    summary,
    urgent: urgent.map((r) => ({ id: r.id, requestCode: r.requestCode, eventId: r.eventId, eventName: r.eventName, categoryName: r.categoryName, location: r.location, createdAt: r.createdAt })),
  });
}

export async function eventAnalytics(req, res) {
  const eventId = idParam(req.params.eventId, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  res.json(await help.analytics({ eventId }));
}

export async function assign(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer !== 'organizer') throw forbidden('Only the event organizer can assign requests');
  const volunteer = (await help.responders(request.eventId)).find((v) => v.id === req.body.volunteerId);
  if (!volunteer) throw unprocessable('Please fix the highlighted fields', { volunteerId: 'Choose one of this event\'s volunteers' });
  const updated = await help.assign(request.id, volunteer, req.user.id);
  if (!updated) throw conflict('Work has already started on this request, so it can no longer be reassigned');
  await alerts.assigned(updated);
  await respond(res, request.id, viewer, req.user);
}

export async function setPriority(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer !== 'organizer') throw forbidden('Only the event organizer can change the priority');
  if (request.priority !== req.body.priority) {
    const changed = await help.setPriority(request.id, req.body.priority, req.user.id, req.body.reason);
    if (!changed) throw conflict('This request is finished, so its priority can no longer change');
    await alerts.priorityChanged(changed.request, changed.before);
  }
  await respond(res, request.id, viewer, req.user);
}

export async function escalate(req, res) {
  const { request, viewer } = await loadFor(req);
  if (viewer !== 'organizer') throw forbidden('Only the event organizer can escalate a request');
  const updated = await help.escalate(request.id, { userId: req.user.id, raise: true, reason: req.body.reason || 'Escalated by the organizer' });
  if (!updated) throw conflict('This request is finished, so it cannot be escalated');
  if (request.priority !== 'urgent') await alerts.priorityChanged(updated, request.priority);
  await respond(res, request.id, viewer, req.user);
}
