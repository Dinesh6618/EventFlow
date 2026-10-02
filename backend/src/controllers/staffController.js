import * as staff from '../models/staffModel.js';
import { requireEventAccess } from '../services/access.js';
import { idParam } from '../utils/params.js';

export async function list(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  res.json({ staff: await staff.list(eventId) });
}

export async function add(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  const member = await staff.addByEmail(eventId, req.body.email, req.body.role, req.user.id);
  res.status(201).json({ staff: member });
}

export async function remove(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  await requireEventAccess(req.user, eventId, ['organizer']);
  await staff.remove(eventId, idParam(req.params.staffId, 'Staff member'));
  res.status(204).end();
}

/** GET /me/assignments - events the signed-in participant volunteers or judges at. */
export async function myAssignments(req, res) {
  res.json({ assignments: await staff.assignmentsForUser(req.user.id) });
}
