import { query } from '../db.js';
import { ROLES } from '../constants.js';
import * as users from '../models/userModel.js';
import * as staff from '../models/staffModel.js';
import * as ops from '../models/volunteerOpsModel.js';
import * as reports from '../models/volunteerReportModel.js';
import * as tasks from '../models/volunteerTaskModel.js';
import { requireEventAccess } from '../services/access.js';
import * as alerts from '../services/volunteerNotifications.js';
import { localNow } from '../utils/eventStatus.js';
import { conflict, forbidden, notFound, unprocessable } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

const orgEvent = (req) => requireEventAccess(req.user, idParam(req.params.eventId, 'Event'), ['organizer']);

/* ------------------------------------------------------------ shapes */

/**
 * A duty as one viewer may see it. Volunteers get their own duties with the organizer's contact;
 * organizers get the volunteer too. Nobody gets another volunteer's details through here.
 */
function assignmentDto(a, viewer, { now, settings, openRequests = new Set() }) {
  const window = ops.checkInWindow(a, settings, now);
  const live = ['assigned', 'accepted'].includes(a.status);
  const onDuty = Boolean(a.checkInTime && !a.checkOutTime);
  const dto = {
    id: a.id,
    eventId: a.eventId,
    eventName: a.eventName,
    department: { id: a.departmentId, name: a.departmentName },
    shift: a.shiftId ? { id: a.shiftId, name: a.shiftName } : null,
    task: a.task,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    location: a.location,
    instructions: a.departmentInstructions,
    status: a.status,
    liveStatus: ops.liveStatus(a, now),
    attendance: ops.attendanceState(a, now),
    late: a.late,
    onBreak: a.onBreak,
    checkInTime: a.checkInTime,
    checkOutTime: a.checkOutTime,
    minutes: ops.dutyMinutes(a),
    acceptedAt: a.acceptedAt,
  };
  if (viewer === 'volunteer') {
    return {
      ...dto,
      organizer: { name: a.organizerName, contact: a.organizerContact },
      checkInMessage: !live || a.checkInTime ? null : a.status !== 'accepted' ? 'Accept your assignment to check in.' : window.ok ? null : window.reason,
      capabilities: {
        canAccept: a.status === 'assigned',
        canCheckIn: a.status === 'accepted' && !a.checkInTime && window.ok,
        canCheckOut: onDuty,
        canBreak: onDuty,
        canRequestReassignment: live && !a.checkOutTime && !openRequests.has(a.id),
      },
      hasOpenRequest: openRequests.has(a.id),
    };
  }
  return {
    ...dto,
    volunteer: { userId: a.userId, name: a.volunteerName, email: a.volunteerEmail, volunteerCode: a.volunteerCode },
    capabilities: {
      canEdit: live && !a.checkInTime,
      canRemove: live && !onDuty,
      canCheckIn: live && !a.checkInTime,
      canCheckOut: onDuty,
    },
  };
}

function taskDto(t, viewer) {
  const base = {
    id: t.id, eventId: t.eventId, eventName: t.eventName, department: { id: t.departmentId, name: t.departmentName }, title: t.title, description: t.description,
    location: t.location, date: t.date, startTime: t.startTime, endTime: t.endTime, priority: t.priority, status: t.status, instructions: t.instructions,
    acceptedAt: t.acceptedAt, startedAt: t.startedAt, completedAt: t.completedAt,
  };
  if (viewer === 'volunteer') {
    return {
      ...base,
      organizer: { name: t.organizerName, contact: t.organizerContact },
      capabilities: { canAccept: t.status === 'assigned', canStart: t.status === 'accepted', canComplete: t.status === 'in_progress' },
    };
  }
  return {
    ...base,
    volunteer: { userId: t.userId, name: t.volunteerName },
    capabilities: { canEdit: t.status !== 'cancelled', canComplete: tasks.OPEN.includes(t.status), canCancel: tasks.OPEN.includes(t.status) },
  };
}

/** Load an assignment and say how the caller relates to it. Strangers get a 404. */
async function loadAssignment(req) {
  const a = await ops.findAssignment(idParam(req.params.id, 'Assignment'));
  if (!a) throw notFound('Assignment not found');
  let viewer = null;
  if (req.user.role === ROLES.ORGANIZER && a.organizerId === req.user.id) viewer = 'organizer';
  else if (req.user.role === ROLES.PARTICIPANT && a.userId === req.user.id) {
    if (!(await staff.has(a.eventId, req.user.id, 'volunteer'))) throw forbidden('Your volunteer access for this event is switched off');
    viewer = 'volunteer';
  }
  if (!viewer) throw notFound('Assignment not found');
  return { a, viewer };
}

async function loadTask(req) {
  const t = await tasks.findTask(idParam(req.params.id, 'Task'));
  if (!t) throw notFound('Task not found');
  let viewer = null;
  if (req.user.role === ROLES.ORGANIZER && t.organizerId === req.user.id) viewer = 'organizer';
  else if (req.user.role === ROLES.PARTICIPANT && t.userId === req.user.id) {
    if (!(await staff.has(t.eventId, req.user.id, 'volunteer'))) throw forbidden('Your volunteer access for this event is switched off');
    viewer = 'volunteer';
  }
  if (!viewer) throw notFound('Task not found');
  return { t, viewer };
}

const openRequestIds = async (userId) => new Set((await tasks.requestsForUser(userId)).filter((r) => r.status === 'requested').map((r) => r.assignmentId));
const context = async () => ({ now: localNow(), settings: await ops.getSettings() });

/* ------------------------------------------------------- organizer: overview */

export async function overview(req, res) {
  const { event } = await orgEvent(req);
  const { now, settings } = await context();
  res.json(await reports.overview(event, now, settings));
}

export async function analytics(req, res) {
  const { event } = await orgEvent(req);
  res.json(await reports.analytics({ eventId: event.id }, localNow()));
}

export async function eventAudit(req, res) {
  const { event } = await orgEvent(req);
  res.json({ log: await ops.auditLog({ eventId: event.id }) });
}

/* ------------------------------------------------- organizer: volunteer list */

const pickCurrent = (list, now) => {
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const live = list.filter((a) => ['assigned', 'accepted', 'completed'].includes(a.status));
  const nowDuty = live.find((a) => a.date === now.date && mins(a.startTime) <= mins(now.time) && mins(now.time) < mins(a.endTime));
  if (nowDuty) return nowDuty;
  const upcoming = live.filter((a) => a.date > now.date || (a.date === now.date && a.startTime >= now.time)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  return upcoming[0] ?? live.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime))[0] ?? null;
};

export async function volunteerList(req, res) {
  const { event } = await orgEvent(req);
  const now = localNow();
  const f = req.query;
  const people = await query(
    `SELECT s.id AS "staffId", s.user_id AS "userId", s.is_active AS "isActive", s.notes, u.name, u.email, u.phone, u.department, u.year, p.volunteer_code AS "volunteerCode"
       FROM event_staff s JOIN users u ON u.id = s.user_id LEFT JOIN volunteer_profiles p ON p.user_id = s.user_id
      WHERE s.event_id = $1 AND s.staff_role = 'volunteer' ORDER BY u.name`,
    [event.id],
  );
  // Volunteers added by email before profiles existed get theirs the first time they are listed.
  for (const p of people.filter((x) => !x.volunteerCode)) p.volunteerCode = (await ops.ensureProfile(p.userId)).volunteerCode;
  const all = await ops.listAssignments(event.id);

  let rows = people.map((p) => {
    const mine = all.filter((a) => a.userId === p.userId);
    const on = f.date ? mine.filter((a) => a.date === f.date) : mine;
    const current = pickCurrent(on, now);
    const live = current ? ops.liveStatus(current, now) : null;
    return {
      staffId: p.staffId, userId: p.userId, name: p.name, email: p.email, phone: p.phone, academicDepartment: p.department, year: p.year, volunteerCode: p.volunteerCode, isActive: p.isActive, notes: p.notes,
      event: event.name,
      department: current ? current.departmentName : null,
      status: !p.isActive ? 'inactive' : live ?? 'available',
      current: current ? { id: current.id, departmentId: current.departmentId, departmentName: current.departmentName, shiftId: current.shiftId, shiftName: current.shiftName, date: current.date, startTime: current.startTime, endTime: current.endTime, location: current.location, task: current.task, status: current.status } : null,
      attendance: current ? ops.attendanceState(current, now) : null,
      late: Boolean(current?.late),
      assignmentCount: mine.filter((a) => ['assigned', 'accepted', 'completed'].includes(a.status)).length,
      _all: mine,
    };
  });

  const q = f.search?.toLowerCase();
  if (q) rows = rows.filter((r) => [r.name, r.email, r.volunteerCode].some((v) => String(v ?? '').toLowerCase().includes(q)));
  if (f.departmentId) rows = rows.filter((r) => r._all.some((a) => a.departmentId === f.departmentId && ['assigned', 'accepted', 'completed'].includes(a.status)));
  if (f.shiftId) rows = rows.filter((r) => r._all.some((a) => a.shiftId === f.shiftId && ['assigned', 'accepted', 'completed'].includes(a.status)));
  if (f.date) rows = rows.filter((r) => r._all.some((a) => a.date === f.date && ['assigned', 'accepted', 'completed'].includes(a.status)));
  if (f.status) rows = rows.filter((r) => r.status === f.status);
  if (f.attendance) rows = rows.filter((r) => (f.attendance === 'late' ? r.late : r.attendance === f.attendance));

  res.json({ volunteers: rows.map(({ _all, ...r }) => r), total: people.length });
}

export async function volunteerDetail(req, res) {
  const { event } = await orgEvent(req);
  const userId = idParam(req.params.userId, 'Volunteer');
  const row = (await query(`SELECT s.is_active AS "isActive", s.notes FROM event_staff s WHERE s.event_id = $1 AND s.user_id = $2 AND s.staff_role = 'volunteer'`, [event.id, userId]))[0];
  if (!row) throw notFound('Volunteer not found');
  const [user, profile, assignments, taskRows, log, application, requests] = await Promise.all([
    users.findById(userId),
    ops.ensureProfile(userId),
    ops.listAssignments(event.id, { userId, includeRemoved: true }),
    tasks.listTasks(event.id, { userId }),
    ops.auditLog({ eventId: event.id, userId, limit: 100 }),
    query(`SELECT status, message, preferred_department AS "preferredDepartment", created_at AS "createdAt" FROM volunteer_applications WHERE event_id = $1 AND user_id = $2`, [event.id, userId]),
    tasks.requestsForUser(userId),
  ]);
  const { now, settings } = await context();
  const dtos = assignments.map((a) => assignmentDto(a, 'organizer', { now, settings }));
  const minutes = assignments.filter((a) => a.checkInTime).reduce((n, a) => n + ops.dutyMinutes(a), 0);
  const current = pickCurrent(assignments, now);
  res.json({
    volunteer: {
      userId, name: user.name, email: user.email, phone: user.phone, department: user.department, college: user.college, year: user.year, skills: user.skills,
      volunteerCode: profile.volunteerCode, interests: profile.interests, experience: profile.experience, availability: profile.availability, platformStatus: profile.status,
      isActive: row.isActive, notes: row.notes,
      status: !row.isActive ? 'inactive' : (current ? ops.liveStatus(current, now) : null) ?? 'available',
    },
    application: application[0] ?? null,
    currentAssignment: current ? dtos.find((d) => d.id === current.id) : null,
    assignments: dtos,
    attendance: dtos.filter((d) => d.checkInTime).map((d) => ({ assignmentId: d.id, department: d.department.name, date: d.date, checkInTime: d.checkInTime, checkOutTime: d.checkOutTime, minutes: d.minutes, late: d.late, location: d.location })),
    totalHours: Math.round((minutes / 60) * 10) / 10,
    tasks: { completed: taskRows.filter((t) => t.status === 'completed').map((t) => taskDto(t, 'organizer')), pending: taskRows.filter((t) => tasks.OPEN.includes(t.status)).map((t) => taskDto(t, 'organizer')) },
    reassignmentRequests: requests.filter((r) => r.eventId === event.id),
    timeline: log.map((l) => ({ id: l.id, action: l.action, message: l.message, by: l.actorName, at: l.createdAt })),
  });
}

/** Organizer: deactivate or reactivate a volunteer for this event, and keep a private note. */
export async function volunteerUpdate(req, res) {
  const { event } = await orgEvent(req);
  const userId = idParam(req.params.userId, 'Volunteer');
  const current = (await query(`SELECT is_active AS "isActive", notes FROM event_staff WHERE event_id = $1 AND user_id = $2 AND staff_role = 'volunteer'`, [event.id, userId]))[0];
  if (!current) throw notFound('Volunteer not found');
  const { isActive = current.isActive, notes = current.notes } = req.body;
  await query(`UPDATE event_staff SET is_active = $3, notes = $4 WHERE event_id = $1 AND user_id = $2 AND staff_role = 'volunteer'`, [event.id, userId, isActive, notes]);
  if (current.isActive && !isActive) {
    // Switching someone off frees what they have not started.
    const open = (await ops.listAssignments(event.id, { userId })).filter((a) => ['assigned', 'accepted'].includes(a.status) && !a.checkInTime);
    for (const a of open) {
      await ops.removeAssignment(a, req.user.id, 'Volunteer deactivated');
      await alerts.removed(a);
    }
  }
  if (current.isActive !== isActive) {
    await query(`INSERT INTO volunteer_audit (event_id, actor_id, user_id, action, message) VALUES ($1, $2, $3, $4, $5)`, [event.id, req.user.id, userId, isActive ? 'volunteer_reactivated' : 'volunteer_deactivated', isActive ? 'Volunteer reactivated' : 'Volunteer deactivated for this event']);
  }
  res.json({ ok: true, isActive, notes });
}

/* ----------------------------------------------------------- departments */

export async function listDepartments(req, res) {
  const { event } = await orgEvent(req);
  const [departments, templates] = await Promise.all([ops.listDepartments(event.id), query(`SELECT id, name, description, instructions FROM volunteer_categories WHERE is_active ORDER BY name`)]);
  res.json({ departments: departments.map((d) => ({ ...d, needed: Math.max(d.requiredCount - d.assigned, 0) })), templates });
}

export async function createDepartment(req, res) {
  const { event } = await orgEvent(req);
  const department = await ops.createDepartment(event.id, req.body);
  await query(`INSERT INTO volunteer_audit (event_id, actor_id, action, message) VALUES ($1, $2, 'department_created', $3)`, [event.id, req.user.id, `Department created: ${department.name} (${department.requiredCount} needed)`]);
  res.status(201).json({ department });
}

async function ownedDepartment(req) {
  const department = await ops.findDepartment(idParam(req.params.id, 'Department'));
  if (!department) throw notFound('Department not found');
  await requireEventAccess(req.user, department.eventId, ['organizer']);
  return department;
}

export async function updateDepartment(req, res) {
  const department = await ownedDepartment(req);
  const next = await ops.updateDepartment(department.id, req.body);
  await query(`INSERT INTO volunteer_audit (event_id, actor_id, action, message) VALUES ($1, $2, 'department_changed', $3)`, [department.eventId, req.user.id, `Department updated: ${next.name}`]);
  res.json({ department: next });
}

export async function deleteDepartment(req, res) {
  const department = await ownedDepartment(req);
  await ops.deleteDepartment(department.id);
  await query(`INSERT INTO volunteer_audit (event_id, actor_id, action, message) VALUES ($1, $2, 'department_deleted', $3)`, [department.eventId, req.user.id, `Department deleted: ${department.name}`]);
  res.status(204).end();
}

/* ---------------------------------------------------------------- shifts */

export async function listShifts(req, res) {
  const { event } = await orgEvent(req);
  res.json({ shifts: await ops.listShifts(event.id) });
}

export async function createShift(req, res) {
  const { event } = await orgEvent(req);
  const ids = req.body.departmentIds ?? [req.body.departmentId];
  const created = [];
  for (const departmentId of ids) {
    const department = await ops.findDepartment(departmentId);
    if (!department || department.eventId !== event.id) throw unprocessable('Please fix the highlighted fields', { departmentId: 'Choose this event\'s departments' });
    if (req.body.date < event.date || req.body.date > (event.endDate || event.date)) throw unprocessable('Please fix the highlighted fields', { date: 'Pick one of the event days' });
    created.push(await ops.createShift(event.id, { ...req.body, departmentId }));
  }
  res.status(201).json({ shifts: created });
}

async function ownedShift(req) {
  const shift = await ops.findShift(idParam(req.params.id, 'Shift'));
  if (!shift) throw notFound('Shift not found');
  await requireEventAccess(req.user, shift.eventId, ['organizer']);
  return shift;
}

export async function updateShift(req, res) {
  const shift = await ownedShift(req);
  res.json({ shift: await ops.updateShift(shift.id, req.body) });
}

export async function deleteShift(req, res) {
  const shift = await ownedShift(req);
  await ops.deleteShift(shift.id);
  res.status(204).end();
}

/* ----------------------------------------------------------- assignments */

/** Fill in what the organizer left out from the shift, then the department. */
async function resolveDuty(event, b) {
  const department = await ops.findDepartment(b.departmentId);
  const shift = b.shiftId ? await ops.findShift(b.shiftId) : null;
  const duty = {
    ...b,
    date: b.date ?? shift?.date,
    startTime: b.startTime ?? shift?.startTime ?? department?.shiftStart,
    endTime: b.endTime ?? shift?.endTime ?? department?.shiftEnd,
    location: b.location || department?.location || '',
  };
  const errors = {};
  if (!duty.date) errors.date = 'Choose a date';
  if (!duty.startTime) errors.startTime = 'Choose a start time, or pick a shift';
  if (!duty.endTime) errors.endTime = 'Choose an end time, or pick a shift';
  if (Object.keys(errors).length) throw unprocessable('Please fix the highlighted fields', errors);
  return duty;
}

export async function listAssignments(req, res) {
  const { event } = await orgEvent(req);
  const { now, settings } = await context();
  const [rows, requests] = await Promise.all([ops.listAssignments(event.id, req.query), tasks.listRequests(event.id, { status: 'requested' })]);
  res.json({
    assignments: rows.map((a) => ({ ...assignmentDto(a, 'organizer', { now, settings }), reassignmentRequested: requests.some((r) => r.assignmentId === a.id) })),
  });
}

export async function createAssignment(req, res) {
  const { event } = await orgEvent(req);
  const duty = await resolveDuty(event, req.body);
  const created = await ops.createAssignment(event, duty, req.user.id);
  await alerts.assigned(created);
  const { now, settings } = await context();
  res.status(201).json({ assignment: assignmentDto(created, 'organizer', { now, settings }) });
}

export async function updateAssignment(req, res) {
  const { a, viewer } = await loadAssignment(req);
  if (viewer !== 'organizer') throw forbidden('Only the event organizer can change an assignment');
  const { event } = await requireEventAccess(req.user, a.eventId, ['organizer']);
  const updated = await ops.updateAssignment(event, a, req.body, req.user.id);
  await alerts.changed(updated, a.userId);
  const { now, settings } = await context();
  res.json({ assignment: assignmentDto(updated, 'organizer', { now, settings }) });
}

export async function removeAssignment(req, res) {
  const { a, viewer } = await loadAssignment(req);
  if (viewer !== 'organizer') throw forbidden('Only the event organizer can remove an assignment');
  await ops.removeAssignment(a, req.user.id, req.body?.reason ? `Removed: ${req.body.reason}` : 'Removed by the organizer');
  await alerts.removed(a);
  res.status(204).end();
}

/** Volunteer confirms the duty they were given. */
export async function acceptAssignment(req, res) {
  const { a, viewer } = await loadAssignment(req);
  if (viewer !== 'volunteer') throw forbidden('Only the volunteer can accept their own assignment');
  const updated = await ops.accept(a);
  if (!updated) throw conflict(`This assignment is ${a.status}, so it cannot be accepted`);
  await alerts.accepted(updated);
  const { now, settings } = await context();
  res.json({ assignment: assignmentDto(updated, 'volunteer', { now, settings }) });
}

export async function checkIn(req, res) {
  const { a, viewer } = await loadAssignment(req);
  const { now, settings } = await context();
  const updated = await ops.checkIn(a, { byUserId: viewer === 'organizer' ? req.user.id : null, now, settings, override: viewer === 'organizer' });
  if (updated.late && viewer === 'volunteer') await alerts.lateCheckIn(updated);
  res.json({ assignment: assignmentDto(updated, viewer, { now, settings }) });
}

export async function checkOut(req, res) {
  const { a, viewer } = await loadAssignment(req);
  const updated = await ops.checkOut(a, { byUserId: viewer === 'organizer' ? req.user.id : null });
  const { now, settings } = await context();
  res.json({ assignment: assignmentDto(updated, viewer, { now, settings }) });
}

export async function setBreak(req, res) {
  const { a, viewer } = await loadAssignment(req);
  if (viewer !== 'volunteer') throw forbidden('Only the volunteer can take a break');
  const updated = await ops.setBreak(a, req.body.onBreak);
  const { now, settings } = await context();
  res.json({ assignment: assignmentDto(updated, viewer, { now, settings }) });
}

/** Attendance for one day: the numbers and who is where. */
export async function attendance(req, res) {
  const { event } = await orgEvent(req);
  const { now, settings } = await context();
  const date = req.query.date ?? now.date;
  const day = await ops.attendanceForDay(event.id, date, now);
  res.json({ date, summary: day.summary, rows: day.rows.map((a) => assignmentDto(a, 'organizer', { now, settings })) });
}

/* ----------------------------------------------------------------- tasks */

export async function listTasks(req, res) {
  const { event } = await orgEvent(req);
  res.json({ tasks: (await tasks.listTasks(event.id, req.query)).map((t) => taskDto(t, 'organizer')) });
}

export async function createTask(req, res) {
  const { event } = await orgEvent(req);
  const created = await tasks.createTask(event, req.body, req.user.id);
  await alerts.taskAssigned(created);
  res.status(201).json({ task: taskDto(created, 'organizer') });
}

export async function updateTask(req, res) {
  const { t, viewer } = await loadTask(req);
  if (viewer !== 'organizer') throw forbidden('Volunteers cannot change the requirements of a task');
  const { event } = await requireEventAccess(req.user, t.eventId, ['organizer']);
  const { allowCompleted, ...patch } = req.body;
  const updated = await tasks.updateTask(event, t, patch, req.user.id, { allowCompleted });
  await alerts.taskChanged(updated, t.userId);
  res.json({ task: taskDto(updated, 'organizer') });
}

export async function acceptTask(req, res) {
  const { t, viewer } = await loadTask(req);
  if (viewer !== 'volunteer') throw forbidden('Only the assigned volunteer can accept a task');
  const updated = await tasks.acceptTask(t, req.user.id);
  if (!updated) throw conflict(`This task is ${t.status.replace('_', ' ')}, so it cannot be accepted`);
  res.json({ task: taskDto(updated, 'volunteer') });
}

export async function startTask(req, res) {
  const { t, viewer } = await loadTask(req);
  if (viewer !== 'volunteer') throw forbidden('Only the assigned volunteer can start a task');
  const updated = await tasks.startTask(t, req.user.id);
  if (!updated) throw conflict(t.status === 'assigned' ? 'Accept the task before starting it' : `This task is ${t.status.replace('_', ' ')}, so it cannot be started`);
  res.json({ task: taskDto(updated, 'volunteer') });
}

export async function completeTask(req, res) {
  const { t, viewer } = await loadTask(req);
  const updated = await tasks.completeTask(t, req.user.id, { organizer: viewer === 'organizer' });
  if (!updated) throw conflict(t.status === 'completed' ? 'This task is already completed' : viewer === 'volunteer' ? 'Start the task before completing it' : `This task is ${t.status.replace('_', ' ')}`);
  if (viewer === 'volunteer') await alerts.taskDone(updated);
  res.json({ task: taskDto(updated, viewer) });
}

/* ----------------------------------------------- reassignment, announcements */

export async function requestReassignment(req, res) {
  const { a, viewer } = await loadAssignment(req);
  if (viewer !== 'volunteer') throw forbidden('Only the volunteer can ask to be reassigned');
  const request = await tasks.createRequest(a, req.body.reason);
  await alerts.reassignmentRequested(a, req.body.reason);
  res.status(201).json({ request });
}

export async function listReassignments(req, res) {
  const { event } = await orgEvent(req);
  res.json({ requests: await tasks.listRequests(event.id) });
}

export async function decideReassignment(req, res) {
  const request = await tasks.findRequest(idParam(req.params.id, 'Request'));
  if (!request) throw notFound('Request not found');
  const { event } = await requireEventAccess(req.user, request.eventId, ['organizer']);
  const assignment = await ops.findAssignment(request.assignmentId);
  const decided = await tasks.decideRequest(request, assignment, req.body.status, req.body.note, req.user.id);
  if (!decided) throw conflict('This request was already decided');
  await alerts.reassignmentDecided(decided, event);
  res.json({ request: decided });
}

export async function listAnnouncements(req, res) {
  const { event } = await orgEvent(req);
  res.json({ announcements: await tasks.listAnnouncements(event.id) });
}

export async function createAnnouncement(req, res) {
  const { event } = await orgEvent(req);
  const { id, recipientIds } = await tasks.createAnnouncement(event, req.body, req.user.id);
  await alerts.announcement(recipientIds, event, req.body);
  res.status(201).json({ announcement: await tasks.findAnnouncement(id) });
}

/* ------------------------------------------------------ volunteer: own area */

export async function myDashboard(req, res) {
  const { now, settings } = await context();
  const userId = req.user.id;
  const [assignments, taskRows, announcements, requests, summary, profile] = await Promise.all([
    ops.assignmentsForUser(userId),
    tasks.tasksForUser(userId),
    tasks.announcementsForUser(userId),
    tasks.requestsForUser(userId),
    reports.volunteerSummary(userId),
    ops.ensureProfile(userId),
  ]);
  const open = new Set(requests.filter((r) => r.status === 'requested').map((r) => r.assignmentId));
  const duties = assignments.map((a) => assignmentDto(a, 'volunteer', { now, settings, openRequests: open }));
  const today = duties.filter((d) => d.date === now.date);
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const unfinished = duties.filter((d) => ['assigned', 'accepted'].includes(d.status));
  const current = today.find((d) => ['assigned', 'accepted'].includes(d.status) && mins(d.startTime) <= mins(now.time) && mins(now.time) < mins(d.endTime))
    ?? today.find((d) => d.attendance === 'checked_in')
    ?? unfinished.find((d) => d.date === now.date && d.startTime >= now.time)
    ?? null;
  const next = unfinished.find((d) => d.date > now.date || (d.date === now.date && d.startTime >= now.time && d.id !== current?.id)) ?? null;
  const own = taskRows.map((t) => taskDto(t, 'volunteer'));
  res.json({
    volunteer: { name: req.user.name, volunteerCode: profile.volunteerCode, status: profile.status },
    today,
    current,
    next,
    tasks: {
      today: own.filter((t) => t.date === now.date && tasks.OPEN.includes(t.status)),
      upcoming: own.filter((t) => t.date > now.date && tasks.OPEN.includes(t.status)),
      completed: own.filter((t) => t.status === 'completed').length,
    },
    announcements: announcements.slice(0, 5),
    openRequests: requests.filter((r) => r.status === 'requested'),
    summary,
    organizer: current ? current.organizer : next ? next.organizer : null,
  });
}

export async function myTasks(req, res) {
  const rows = (await tasks.tasksForUser(req.user.id)).map((t) => taskDto(t, 'volunteer'));
  const today = localNow().date;
  res.json({
    today: rows.filter((t) => t.date === today && tasks.OPEN.includes(t.status)),
    upcoming: rows.filter((t) => t.date > today && tasks.OPEN.includes(t.status)),
    overdue: rows.filter((t) => t.date < today && tasks.OPEN.includes(t.status)),
    completed: rows.filter((t) => t.status === 'completed'),
    cancelled: rows.filter((t) => t.status === 'cancelled'),
  });
}

export async function mySchedule(req, res) {
  const { now, settings } = await context();
  const open = await openRequestIds(req.user.id);
  res.json({ assignments: (await ops.assignmentsForUser(req.user.id)).map((a) => assignmentDto(a, 'volunteer', { now, settings, openRequests: open })) });
}

export async function myHistory(req, res) {
  const { now, settings } = await context();
  const [assignments, rows, summary] = await Promise.all([ops.assignmentsForUser(req.user.id), tasks.tasksForUser(req.user.id), reports.volunteerSummary(req.user.id)]);
  res.json({
    summary,
    duties: assignments.filter((a) => a.status === 'completed').map((a) => assignmentDto(a, 'volunteer', { now, settings })).reverse(),
    tasks: rows.filter((t) => t.status === 'completed').map((t) => taskDto(t, 'volunteer')),
  });
}

export async function myAnnouncements(req, res) {
  res.json({ announcements: await tasks.announcementsForUser(req.user.id) });
}

export async function myProfile(req, res) {
  const [user, profile, summary] = await Promise.all([users.findById(req.user.id), ops.ensureProfile(req.user.id), reports.volunteerSummary(req.user.id)]);
  res.json({ profile: { name: user.name, email: user.email, phone: user.phone, department: user.department, year: user.year, skills: user.skills, ...profile }, summary });
}

export async function updateMyProfile(req, res) {
  const { skills, phone, year, ...volunteer } = req.body;
  if (skills !== undefined || phone !== undefined || year !== undefined) {
    const u = await users.findById(req.user.id);
    await users.updateProfile(req.user.id, { name: u.name, department: u.department, college: u.college, skills, phone, year });
  }
  await ops.updateProfile(req.user.id, volunteer);
  return myProfile(req, res);
}
