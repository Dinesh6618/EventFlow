import * as attendance from '../models/attendanceModel.js';
import { requireEventAccess } from '../services/access.js';
import { toCsv } from '../utils/csv.js';
import { idParam } from '../utils/params.js';

/** POST /events/:id/attendance/scan - organizer or volunteer scans a participant's QR code. */
export async function scan(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer', 'volunteer']);
  res.json(await attendance.scan(eventId, req.body.code, req.body.action, req.user.id, req.body.sessionId));
}

/** POST /events/:id/attendance/manual - organizer records attendance without a QR code. */
export async function mark(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  res.json(await attendance.mark(eventId, req.body.registrationId, req.body.action, req.user.id));
}

/**
 * GET /events/:id/attendance - dashboard numbers and the attendee list.
 * Volunteers only get the numbers and the live feed, not the participant list.
 */
export async function dashboard(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  const { event, capacity } = await requireEventAccess(req.user, eventId, ['organizer', 'volunteer']);

  const everyone = await attendance.listAttendees(event);
  const body = {
    event: { id: event.id, name: event.name, date: event.date, status: event.status },
    summary: attendance.summarize(everyone),
    recent: await attendance.recent(eventId),
    capacity,
  };
  if (capacity === 'organizer') body.attendees = await attendance.listAttendees(event, req.query);
  res.json(body);
}

/** GET /events/:id/attendance/export */
export async function exportCsv(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  const { event } = await requireEventAccess(req.user, eventId, ['organizer']);
  const rows = await attendance.listAttendees(event);
  const label = { registered: 'Registered', checked_in: 'Checked In', checked_out: 'Checked Out', absent: 'Absent' };

  res
    .set('Content-Type', 'text/csv; charset=utf-8')
    .set('Content-Disposition', 'attachment; filename="attendance.csv"')
    .send(
      toCsv(rows, [
        { header: 'Participant ID', value: (r) => r.participantCode },
        { header: 'Name', value: (r) => r.name },
        { header: 'Email', value: (r) => r.email },
        { header: 'Department', value: (r) => r.department },
        { header: 'College', value: (r) => r.college },
        { header: 'Status', value: (r) => label[r.state] },
        { header: 'Check-in time', value: (r) => r.checkInTime },
        { header: 'Check-out time', value: (r) => r.checkOutTime },
      ]),
    );
}
