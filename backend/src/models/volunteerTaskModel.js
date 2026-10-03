import { query, transaction } from '../db.js';
import { conflict, unprocessable } from '../utils/httpError.js';
import { COUNTED, assertRemovable, audit, releaseInTx } from './volunteerOpsModel.js';

export const TASK_STATUSES = ['assigned', 'accepted', 'in_progress', 'completed', 'cancelled'];
/** Not finished and not cancelled. */
export const OPEN = ['assigned', 'accepted', 'in_progress'];

/* ------------------------------------------------------------------ tasks */

const TASK = `
  SELECT k.id, k.event_id AS "eventId", e.name AS "eventName", e.organizer_id AS "organizerId", e.organizer_name AS "organizerName", e.organizer_contact AS "organizerContact",
         k.department_id AS "departmentId", d.name AS "departmentName", k.user_id AS "userId", u.name AS "volunteerName",
         k.title, k.description, k.location, to_char(k.date, 'YYYY-MM-DD') AS date, to_char(k.start_time, 'HH24:MI') AS "startTime", to_char(k.end_time, 'HH24:MI') AS "endTime",
         k.priority, k.status, k.instructions, k.accepted_at AS "acceptedAt", k.started_at AS "startedAt", k.completed_at AS "completedAt", k.created_at AS "createdAt"
    FROM volunteer_tasks k
    JOIN events e ON e.id = k.event_id
    JOIN volunteer_departments d ON d.id = k.department_id
    JOIN users u ON u.id = k.user_id`;

const ORDER = `ORDER BY CASE WHEN k.status IN ('completed', 'cancelled') THEN 1 ELSE 0 END, CASE k.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, k.date, k.start_time`;

export const findTask = async (id) => (await query(`${TASK} WHERE k.id = $1`, [id]))[0];

export function listTasks(eventId, { status, departmentId, userId, priority, date } = {}) {
  return query(
    `${TASK} WHERE k.event_id = $1 AND ($2::text IS NULL OR k.status = $2) AND ($3::int IS NULL OR k.department_id = $3) AND ($4::int IS NULL OR k.user_id = $4)
        AND ($5::text IS NULL OR k.priority = $5) AND ($6::date IS NULL OR k.date = $6::date) ${ORDER}`,
    [eventId, status ?? null, departmentId ?? null, userId ?? null, priority ?? null, date ?? null],
  );
}

export const tasksForUser = (userId) => query(`${TASK} WHERE k.user_id = $1 ${ORDER}`, [userId]);

/** Has this volunteer been given a duty in the department? A task needs one. */
async function holdsDuty(run, eventId, userId, departmentId, statuses = COUNTED) {
  return (await run(`SELECT 1 FROM volunteer_assignments WHERE event_id = $1 AND user_id = $2 AND department_id = $3 AND status = ANY($4) LIMIT 1`, [eventId, userId, departmentId, statuses])).length > 0;
}

async function validateTask(run, event, t) {
  const dept = (await run(`SELECT id, name FROM volunteer_departments WHERE id = $1 AND event_id = $2`, [t.departmentId, event.id]))[0];
  if (!dept) throw unprocessable('Please fix the highlighted fields', { departmentId: 'Choose one of this event\'s departments' });
  if (t.date < event.date || t.date > (event.endDate || event.date)) throw unprocessable('Please fix the highlighted fields', { date: 'Pick one of the event days' });
  if (t.endTime <= t.startTime) throw unprocessable('Please fix the highlighted fields', { endTime: 'End time must be after the start time' });
  const person = (await run(`SELECT u.name, s.is_active AS "isActive" FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = $1 AND s.user_id = $2 AND s.staff_role = 'volunteer'`, [event.id, t.userId]))[0];
  if (!person) throw unprocessable('Please fix the highlighted fields', { userId: 'Choose one of this event\'s approved volunteers' });
  if (!person.isActive) throw conflict(`${person.name} is deactivated for this event`, { userId: 'This volunteer is deactivated' });
  if (!(await holdsDuty(run, event.id, t.userId, t.departmentId))) {
    throw unprocessable('Please fix the highlighted fields', { userId: `${person.name} has no assignment in ${dept.name}. Assign them to the department first.` });
  }
  return { dept, person };
}

export async function createTask(event, t, actorId) {
  return transaction(async (run) => {
    const { dept } = await validateTask(run, event, t);
    const rows = await run(
      `INSERT INTO volunteer_tasks (event_id, department_id, user_id, title, description, location, date, start_time, end_time, priority, instructions, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8::time, $9::time, $10, $11, $12) RETURNING id`,
      [event.id, t.departmentId, t.userId, t.title, t.description, t.location, t.date, t.startTime, t.endTime, t.priority, t.instructions, actorId],
    );
    await audit(run, { eventId: event.id, actorId, userId: t.userId, action: 'task_created', message: `Task assigned: ${t.title} (${dept.name}, ${t.priority})`, meta: { taskId: rows[0].id } });
    return (await run(`${TASK} WHERE k.id = $1`, [rows[0].id]))[0];
  });
}

/**
 * Edit a task (organizer). A completed task is locked: it only changes when the organizer says so
 * with `allowCompleted`. Changing the volunteer or the time sends it back to ASSIGNED for re-acceptance.
 */
export async function updateTask(event, current, patch, actorId, { allowCompleted = false } = {}) {
  if (current.status === 'completed' && !allowCompleted) throw conflict('This task is completed and locked. Confirm that you want to edit a completed task to continue.');
  if (current.status === 'cancelled' && patch.status !== 'assigned') throw conflict('This task was cancelled');
  const next = { ...current, ...patch };
  const reset = ['userId', 'departmentId', 'date', 'startTime', 'endTime'].some((k) => patch[k] !== undefined && patch[k] !== current[k]);
  const status = patch.status === 'cancelled' ? 'cancelled' : reset ? 'assigned' : current.status === 'cancelled' ? 'assigned' : current.status;
  return transaction(async (run) => {
    if (status !== 'cancelled') await validateTask(run, event, next);
    await run(
      `UPDATE volunteer_tasks SET department_id = $2, user_id = $3, title = $4, description = $5, location = $6, date = $7::date, start_time = $8::time, end_time = $9::time,
              priority = $10, instructions = $11, status = $12::text,
              accepted_at = CASE WHEN $13 THEN NULL ELSE accepted_at END, started_at = CASE WHEN $13 THEN NULL ELSE started_at END,
              completed_at = CASE WHEN $12::text = 'completed' THEN completed_at ELSE NULL END, updated_at = NOW() WHERE id = $1`,
      [current.id, next.departmentId, next.userId, next.title, next.description, next.location, next.date, next.startTime, next.endTime, next.priority, next.instructions, status, reset],
    );
    await audit(run, { eventId: event.id, actorId, userId: next.userId, action: status === 'cancelled' ? 'task_cancelled' : 'task_changed', message: `${status === 'cancelled' ? 'Task cancelled' : 'Task changed'}: ${next.title}`, meta: { taskId: current.id } });
    return (await run(`${TASK} WHERE k.id = $1`, [current.id]))[0];
  });
}

/** Volunteer side: accept, start, complete. Each step only moves forward from the right state. */
async function step(current, to, from, actorId, message, extraSql = '') {
  return transaction(async (run) => {
    const rows = await run(`UPDATE volunteer_tasks SET status = $2, ${extraSql} updated_at = NOW() WHERE id = $1 AND status = ANY($3) RETURNING id`, [current.id, to, from]);
    if (!rows[0]) return undefined;
    await audit(run, { eventId: current.eventId, actorId, userId: current.userId, action: `task_${to}`, message: `${message}: ${current.title}`, meta: { taskId: current.id } });
    return (await run(`${TASK} WHERE k.id = $1`, [current.id]))[0];
  });
}

export async function acceptTask(current, actorId) {
  // The volunteer has to have accepted their duty first.
  if (!(await holdsDuty(query, current.eventId, current.userId, current.departmentId, ['accepted', 'completed']))) {
    throw conflict('Accept your volunteer assignment for this department first');
  }
  return step(current, 'accepted', ['assigned'], actorId, 'Accepted task', 'accepted_at = NOW(),');
}

export async function startTask(current, actorId) {
  if (!(await holdsDuty(query, current.eventId, current.userId, current.departmentId, ['accepted', 'completed']))) {
    throw conflict('Accept your volunteer assignment for this department first');
  }
  return step(current, 'in_progress', ['accepted'], actorId, 'Started task', 'started_at = NOW(),');
}

/** The volunteer completes a task they started; the organizer may complete any open task. */
export async function completeTask(current, actorId, { organizer = false } = {}) {
  return step(current, 'completed', organizer ? OPEN : ['in_progress'], actorId, 'Completed task', 'completed_at = NOW(), started_at = COALESCE(started_at, NOW()),');
}

/* ------------------------------------------------- reassignment requests */

const REQUEST = `
  SELECT r.id, r.assignment_id AS "assignmentId", r.event_id AS "eventId", r.user_id AS "userId", u.name AS "volunteerName", r.reason, r.status,
         r.review_note AS "reviewNote", r.reviewed_at AS "reviewedAt", r.created_at AS "createdAt",
         d.name AS "departmentName", to_char(a.date, 'YYYY-MM-DD') AS date, to_char(a.start_time, 'HH24:MI') AS "startTime", to_char(a.end_time, 'HH24:MI') AS "endTime", a.task, a.location
    FROM volunteer_reassignment_requests r
    JOIN volunteer_assignments a ON a.id = r.assignment_id
    JOIN volunteer_departments d ON d.id = a.department_id
    JOIN users u ON u.id = r.user_id`;

export const findRequest = async (id) => (await query(`${REQUEST} WHERE r.id = $1`, [id]))[0];
export const listRequests = (eventId, { status } = {}) => query(`${REQUEST} WHERE r.event_id = $1 AND ($2::text IS NULL OR r.status = $2) ORDER BY (r.status = 'requested') DESC, r.created_at DESC`, [eventId, status ?? null]);
export const requestsForUser = (userId) => query(`${REQUEST} WHERE r.user_id = $1 ORDER BY r.created_at DESC`, [userId]);

export async function createRequest(a, reason) {
  if (!['assigned', 'accepted'].includes(a.status) || a.checkOutTime) throw conflict('This assignment can no longer be reassigned');
  try {
    const rows = await query(`INSERT INTO volunteer_reassignment_requests (assignment_id, event_id, user_id, reason) VALUES ($1, $2, $3, $4) RETURNING id`, [a.id, a.eventId, a.userId, reason]);
    await transaction((run) => audit(run, { eventId: a.eventId, actorId: a.userId, userId: a.userId, action: 'reassignment_requested', message: `Asked to be reassigned from ${a.departmentName}: ${reason}`, meta: { assignmentId: a.id } }));
    return findRequest(rows[0].id);
  } catch (err) {
    if (err.code === '23505') throw conflict('You already have an open reassignment request for this assignment');
    throw err;
  }
}

/**
 * Decide a request. Approving frees the volunteer (the assignment is removed and the slot reopens);
 * the organizer then assigns them, or someone else, wherever is needed.
 */
export async function decideRequest(request, assignment, status, note, reviewerId) {
  if (status === 'approved') assertRemovable(assignment);
  return transaction(async (run) => {
    const rows = await run(`UPDATE volunteer_reassignment_requests SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = NOW() WHERE id = $1 AND status = 'requested' RETURNING id`, [request.id, status, note, reviewerId]);
    if (!rows[0]) return undefined;
    if (status === 'approved') await releaseInTx(run, assignment, reviewerId, 'Reassignment approved');
    await audit(run, { eventId: request.eventId, actorId: reviewerId, userId: request.userId, action: `reassignment_${status}`, message: `Reassignment request ${status}${note ? `: ${note}` : ''}`, meta: { requestId: request.id } });
    return (await run(`${REQUEST} WHERE r.id = $1`, [request.id]))[0];
  });
}

/* ---------------------------------------------------------- announcements */

const ANNOUNCEMENT = `
  SELECT n.id, n.event_id AS "eventId", e.name AS "eventName", n.title, n.message, n.scope, n.department_id AS "departmentId", d.name AS "departmentName",
         n.shift_id AS "shiftId", sh.name AS "shiftName", n.user_id AS "userId", v.name AS "volunteerName", n.recipients, n.created_at AS "createdAt", c.name AS "createdByName"
    FROM volunteer_announcements n
    JOIN events e ON e.id = n.event_id
    LEFT JOIN volunteer_departments d ON d.id = n.department_id
    LEFT JOIN volunteer_shifts sh ON sh.id = n.shift_id
    LEFT JOIN users v ON v.id = n.user_id
    LEFT JOIN users c ON c.id = n.created_by`;

export const listAnnouncements = (eventId) => query(`${ANNOUNCEMENT} WHERE n.event_id = $1 ORDER BY n.created_at DESC, n.id DESC LIMIT 100`, [eventId]);

/** What a volunteer has been sent: to everyone, their department, their shift, or them. */
export const announcementsForUser = (userId) =>
  query(
    `${ANNOUNCEMENT}
      WHERE EXISTS (SELECT 1 FROM event_staff s WHERE s.event_id = n.event_id AND s.user_id = $1 AND s.staff_role = 'volunteer' AND s.is_active)
        AND (n.scope = 'all'
          OR (n.scope = 'volunteer' AND n.user_id = $1)
          OR (n.scope = 'department' AND EXISTS (SELECT 1 FROM volunteer_assignments a WHERE a.user_id = $1 AND a.department_id = n.department_id AND a.status = ANY($2)))
          OR (n.scope = 'shift' AND EXISTS (SELECT 1 FROM volunteer_assignments a WHERE a.user_id = $1 AND a.shift_id = n.shift_id AND a.status = ANY($2))))
      ORDER BY n.created_at DESC, n.id DESC LIMIT 50`,
    [userId, COUNTED],
  );

/** Work out who an announcement reaches. */
async function recipientsOf(run, eventId, scope, ids) {
  if (scope === 'all') return run(`SELECT s.user_id AS id FROM event_staff s WHERE s.event_id = $1 AND s.staff_role = 'volunteer' AND s.is_active`, [eventId]);
  if (scope === 'volunteer') return run(`SELECT s.user_id AS id FROM event_staff s WHERE s.event_id = $1 AND s.user_id = $2 AND s.staff_role = 'volunteer' AND s.is_active`, [eventId, ids.userId]);
  const column = scope === 'department' ? 'department_id' : 'shift_id';
  return run(
    `SELECT DISTINCT a.user_id AS id FROM volunteer_assignments a JOIN event_staff s ON s.event_id = a.event_id AND s.user_id = a.user_id AND s.staff_role = 'volunteer' AND s.is_active
      WHERE a.event_id = $1 AND a.${column} = $2 AND a.status = ANY($3)`,
    [eventId, scope === 'department' ? ids.departmentId : ids.shiftId, COUNTED],
  );
}

export async function createAnnouncement(event, a, actorId) {
  return transaction(async (run) => {
    if (a.scope === 'department' && !(await run(`SELECT 1 FROM volunteer_departments WHERE id = $1 AND event_id = $2`, [a.departmentId, event.id])).length) throw unprocessable('Please fix the highlighted fields', { departmentId: 'Choose one of this event\'s departments' });
    if (a.scope === 'shift' && !(await run(`SELECT 1 FROM volunteer_shifts WHERE id = $1 AND event_id = $2`, [a.shiftId, event.id])).length) throw unprocessable('Please fix the highlighted fields', { shiftId: 'Choose one of this event\'s shifts' });
    const recipients = await recipientsOf(run, event.id, a.scope, a);
    if (!recipients.length) throw unprocessable('Please fix the highlighted fields', { scope: 'No volunteers match that audience yet' });
    const rows = await run(
      `INSERT INTO volunteer_announcements (event_id, title, message, scope, department_id, shift_id, user_id, created_by, recipients) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [event.id, a.title, a.message, a.scope, a.scope === 'department' ? a.departmentId : null, a.scope === 'shift' ? a.shiftId : null, a.scope === 'volunteer' ? a.userId : null, actorId, recipients.length],
    );
    await audit(run, { eventId: event.id, actorId, action: 'announcement', message: `Announcement to ${a.scope === 'all' ? 'all volunteers' : a.scope}: ${a.title} (${recipients.length} recipient${recipients.length === 1 ? '' : 's'})` });
    return { id: rows[0].id, recipientIds: recipients.map((r) => r.id) };
  });
}

export async function findAnnouncement(id) {
  return (await query(`${ANNOUNCEMENT} WHERE n.id = $1`, [id]))[0];
}

