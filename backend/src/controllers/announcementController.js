import { ROLES } from '../constants.js';
import { query } from '../db.js';
import * as events from '../models/eventModel.js';
import * as notifications from '../models/notificationModel.js';
import * as registrations from '../models/registrationModel.js';
import { requireEventAccess } from '../services/access.js';
import { appLink } from '../services/email/index.js';
import { emailRegistrants } from '../services/email/broadcasts.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** POST /events/:id/announcements - saved, and delivered as notifications to registrants and staff. */
export async function create(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  const rows = await query(
    `INSERT INTO announcements (event_id, title, message, created_by) VALUES ($1, $2, $3, $4)
     RETURNING id, title, message, created_at AS "createdAt"`,
    [event.id, req.body.title, req.body.message, req.user.id],
  );
  const notified = await notifications.notifyEvent(
    event.id,
    { type: 'announcement', title: req.body.title, message: req.body.message, link: `/events/${event.id}` },
    { includeStaff: true },
  );
  emailRegistrants(
    event.id,
    'eventAnnouncement',
    (p) => ({ name: p.name, eventName: event.name, title: req.body.title, message: req.body.message, eventUrl: appLink(`/events/${event.id}`) }),
    { category: 'announcements' },
  ).catch((err) => console.error('Announcement email failed:', err.message));
  res.status(201).json({ announcement: rows[0], notified });
}

/** GET /events/:id/announcements - the organizer, or participants who hold a seat. */
export async function list(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  const event = await events.findById(eventId);
  if (!event) throw notFound('Event not found');

  const isOwner = req.user.role === ROLES.ORGANIZER && event.organizerId === req.user.id;
  const registration = req.user.role === ROLES.PARTICIPANT ? await registrations.findForUser(eventId, req.user.id) : null;
  if (!isOwner && !(registration && registrations.ACTIVE.includes(registration.status))) throw forbidden();

  const rows = await query(
    `SELECT id, title, message, created_at AS "createdAt" FROM announcements WHERE event_id = $1 ORDER BY id DESC LIMIT 50`,
    [eventId],
  );
  res.json({ announcements: rows });
}
