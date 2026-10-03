import { ROLES } from '../constants.js';
import * as help from '../models/helpModel.js';
import { query } from '../db.js';

/**
 * Who a signed-in user is in relation to one help request, or null when they have no business seeing it.
 * Always decided on the server. A volunteer only counts while they are still a volunteer for the event.
 */
export async function viewerOf(user, request) {
  if (user.role === ROLES.ADMIN) return 'admin';
  if (user.role === ROLES.ORGANIZER) return request.organizerId === user.id ? 'organizer' : null;
  if (user.role === ROLES.PARTICIPANT) {
    if (request.participantId === user.id) return 'participant';
    if (request.assignedVolunteerId === user.id && (await help.isResponder(request.eventId, user.id))) return 'volunteer';
  }
  return null;
}

const can = (status, list) => list.includes(status);

/** What this viewer may do to the request right now. The UI only shows what is true here. */
export function capabilities(request, viewer) {
  const { status } = request;
  const none = { canCancel: false, canAcknowledge: false, canAssign: false, canChangePriority: false, canEscalate: false, canAccept: false, canStart: false, canResolve: false, canClose: false, canUpdate: false, canSetItemStatus: false };
  const itemOk = request.itemStatus !== null && status !== 'cancelled';

  if (viewer === 'participant') return { ...none, canCancel: can(status, ['reported', 'acknowledged', 'assigned']) };
  if (viewer === 'organizer') {
    const active = can(status, help.ACTIVE);
    return {
      ...none,
      canAcknowledge: status === 'reported',
      canAssign: can(status, help.WAITING),
      canChangePriority: active,
      canEscalate: active && !(request.priority === 'urgent' && request.escalated),
      canStart: can(status, ['acknowledged', 'assigned']),
      canResolve: can(status, ['acknowledged', 'assigned', 'in_progress']),
      canClose: status === 'resolved',
      canUpdate: active || status === 'resolved',
      canSetItemStatus: itemOk,
    };
  }
  if (viewer === 'volunteer') {
    return {
      ...none,
      canAccept: status === 'assigned' && !request.acceptedAt,
      canStart: status === 'assigned',
      canResolve: can(status, ['assigned', 'in_progress']),
      canUpdate: can(status, [...help.ACTIVE, 'resolved']),
      canSetItemStatus: itemOk,
    };
  }
  return none;
}

const category = (r) => ({ id: r.categoryId, code: r.categoryCode, name: r.categoryName, icon: r.categoryIcon, isUrgent: r.categoryUrgent });

async function teamLabel(userId) {
  const rows = await query(`SELECT t.name FROM help_team_members m JOIN help_teams t ON t.id = m.team_id WHERE m.user_id = $1 AND t.is_active ORDER BY t.name LIMIT 1`, [userId]);
  return rows[0]?.name ?? null;
}

/**
 * The request as one viewer may see it.
 *  - participant: their own request; the responder is a first name and team, never contact details.
 *  - organizer / volunteer: everything, plus the participant's phone only when they chose to be called.
 *  - admin: metadata for monitoring. No description, no participant, no photos, no messages.
 */
export async function toDto(r, viewer, { settings } = {}) {
  const dto = {
    id: r.id,
    requestCode: r.requestCode,
    eventId: r.eventId,
    eventName: r.eventName,
    category: category(r),
    location: r.location,
    priority: r.priority,
    status: r.status,
    escalated: r.escalated,
    itemStatus: r.itemStatus,
    createdAt: r.createdAt,
    acknowledgedAt: r.acknowledgedAt,
    assignedAt: r.assignedAt,
    acceptedAt: r.acceptedAt,
    startedAt: r.startedAt,
    resolvedAt: r.resolvedAt,
    closedAt: r.closedAt,
    cancelledAt: r.cancelledAt,
    updatedAt: r.updatedAt,
    ageMinutes: Math.round(help.minutesBetween(new Date(), r.createdAt) ?? 0),
    overdue: settings ? help.isOverdue(r, settings) : false,
    viewer,
    capabilities: capabilities(r, viewer),
  };

  if (viewer === 'admin') {
    return { ...dto, assignedTo: r.assignedVolunteerId ? { id: r.assignedVolunteerId, name: r.assignedVolunteerName } : null };
  }

  const withBody = { ...dto, description: r.description, details: r.details, contactPreference: r.contactPreference };
  if (viewer === 'participant') {
    return {
      ...withBody,
      assignedTo: r.assignedVolunteerId
        ? { name: String(r.assignedVolunteerName ?? '').split(' ')[0], team: await teamLabel(r.assignedVolunteerId) }
        : null,
    };
  }
  return {
    ...withBody,
    participant: {
      id: r.participantId,
      name: r.participantName,
      department: r.participantDepartment,
      phone: r.contactPreference === 'call' ? r.participantPhone ?? null : null,
    },
    assignedTo: r.assignedVolunteerId ? { id: r.assignedVolunteerId, name: r.assignedVolunteerName } : null,
  };
}

/** Timeline entries shaped for the viewer: staff see who did what, participants only see what concerns them. */
export function timelineDto(rows, viewer, userId) {
  const staff = viewer === 'organizer' || viewer === 'volunteer';
  return rows.map((u) => ({
    id: u.id,
    kind: u.kind,
    message: u.message,
    at: u.createdAt,
    internal: u.visibility === 'staff',
    by: staff ? u.authorName ?? 'System' : u.userId === userId ? 'You' : u.kind === 'created' ? 'You' : 'Event staff',
  }));
}
