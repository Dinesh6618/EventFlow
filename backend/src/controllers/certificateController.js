import { ROLES } from '../constants.js';
import * as certificates from '../models/certificateModel.js';
import * as notifications from '../models/notificationModel.js';
import { renderCertificate } from '../services/certificatePdf.js';
import { requireEventAccess } from '../services/access.js';
import { notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

const organizerOf = (req) => requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);

export async function listForEvent(req, res) {
  const { event } = await organizerOf(req);
  const [list, eligibility] = await Promise.all([certificates.listForEvent(event.id), certificates.eligibility(event)]);
  res.json({ certificates: list, eligibility, types: certificates.TYPE_LABELS, canIssue: true, visibleToHolders: certificates.hasStarted(event) });
}

export async function issue(req, res) {
  const { event } = await organizerOf(req);
  const { type, recipients, scope, finalistUpToRank } = req.body;

  const issued = recipients
    ? await certificates.issueManual(event, type, recipients, req.user.id)
    : await certificates.issueBulk(event, type, req.user.id, { scope, finalistUpToRank });

  // Holders cannot see a certificate before the event starts, so only tell them when they can open it.
  const label = certificates.TYPE_LABELS[type];
  await Promise.all(
    issued
      .filter((c) => c.userId && certificates.hasStarted(event))
      .map((c) =>
        notifications.safely(() =>
          notifications.notify(c.userId, {
            eventId: event.id,
            type: 'certificate_issued',
            title: 'Your certificate is ready',
            message: `Your ${label} certificate for ${event.name} is ready to download.`,
            link: '/my/certificates',
          }),
        ),
      ),
  );
  res.status(201).json({ issued: issued.length, certificates: issued });
}

export async function revoke(req, res) {
  const { event } = await organizerOf(req);
  await certificates.revoke(event.id, idParam(req.params.certId, 'Certificate'), req.body.reason);
  res.json({ ok: true });
}

export async function mine(req, res) {
  const rows = await certificates.listForUser(req.user.id);
  res.json({ certificates: rows.map((c) => ({ ...c, eventImage: c.eventImage ? `/uploads/${c.eventImage}` : null })), types: certificates.TYPE_LABELS });
}

/** The holder or the event's organizer can download the PDF. */
export async function pdf(req, res) {
  const code = String(req.params.code).toUpperCase();
  const found = certificates.CODE_PATTERN.test(code) ? await certificates.findForPdf(code) : undefined;
  const allowed =
    found &&
    ((req.user.role === ROLES.PARTICIPANT && found.userId === req.user.id && !found.revokedAt && certificates.hasStarted({ date: found.eventDate, startTime: found.eventStartTime })) ||
      (req.user.role === ROLES.ORGANIZER && found.organizerId === req.user.id));
  if (!allowed) throw notFound('Certificate not found');

  const file = await renderCertificate(found);
  res
    .set('Content-Type', 'application/pdf')
    .set('Content-Disposition', `attachment; filename="${found.code}.pdf"`)
    .send(file);
}

/** Organizer only: a sample of the design for one type, with this event's details, to check before issuing. */
export async function preview(req, res) {
  const { event } = await organizerOf(req);
  const type = String(req.query.type || 'participant');
  if (!certificates.TYPES.includes(type)) throw notFound('Unknown certificate type');
  const file = await renderCertificate({
    code: 'EVF-SAMPLE',
    sample: true,
    type,
    recipientName: type === 'speaker' ? 'Guest Speaker' : 'Recipient Name',
    eventName: event.name,
    eventType: event.type,
    college: event.college || req.user.college || null,
    venue: event.venue,
    eventDate: event.date,
    eventEndDate: event.endDate || event.date,
    organizerName: event.organizerName,
    organizerContact: event.organizerContact,
    issuedAt: new Date(),
  });
  res.set('Content-Type', 'application/pdf').set('Content-Disposition', `inline; filename="sample-${type}.pdf"`).send(file);
}

/** Public. Rate limited; returns only what is needed to confirm authenticity. */
export async function verify(req, res) {
  const code = String(req.params.code).trim().toUpperCase();
  if (!certificates.CODE_PATTERN.test(code)) return res.status(404).json({ status: 'NOT_FOUND', valid: false });
  const result = await certificates.verify(code);
  res.status(result.status === 'NOT_FOUND' ? 404 : 200).json(result);
}
