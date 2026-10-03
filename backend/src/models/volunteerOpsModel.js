import { query, transaction } from '../db.js';
import { localNow } from '../utils/eventStatus.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
/** Statuses that hold a slot and occupy the volunteer's time. */
export const LIVE = ['assigned', 'accepted'];
/** Statuses that count towards how many slots a department or shift has filled. */
export const COUNTED = ['assigned', 'accepted', 'completed'];

const DEFAULT_SETTINGS = { earlyCheckInMinutes: 30, lateGraceMinutes: 10, shiftReminderMinutes: 30 };

export async function getSettings() {
  const row = (await query(`SELECT value FROM help_settings WHERE key = 'volunteer'`))[0];
  const value = typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value;
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function saveSettings(value) {
  await query(`INSERT INTO help_settings (key, value) VALUES ('volunteer', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(value)]);
  return getSettings();
}

export const minutesOfDay = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const clock = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/* ------------------------------------------------------------------ audit */

export async function audit(run, { eventId = null, actorId = null, userId = null, action, message, meta = {} }) {
  await run(`INSERT INTO volunteer_audit (event_id, actor_id, user_id, action, message, meta) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [eventId, actorId, userId, action, message, JSON.stringify(meta)]);
}

export const auditLog = ({ eventId, userId, limit = 200 } = {}) =>
  query(
    `SELECT l.id, l.event_id AS "eventId", e.name AS "eventName", l.actor_id AS "actorId", a.name AS "actorName", l.user_id AS "userId", v.name AS "volunteerName",
            l.action, l.message, l.created_at AS "createdAt"
       FROM volunteer_audit l LEFT JOIN events e ON e.id = l.event_id LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN users v ON v.id = l.user_id
      WHERE ($1::int IS NULL OR l.event_id = $1) AND ($2::int IS NULL OR l.user_id = $2)
      ORDER BY l.created_at DESC, l.id DESC LIMIT ${Math.min(limit, 500)}`,
    [eventId ?? null, userId ?? null],
  );

/* --------------------------------------------------------------- profiles */

const PROFILE = `p.id, p.user_id AS "userId", p.volunteer_code AS "volunteerCode", p.interests, p.experience, p.availability, p.status`;

export async function ensureProfile(userId, run = query) {
  await run(
    `INSERT INTO volunteer_profiles (user_id, volunteer_code) VALUES ($1, 'VOL-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('volunteer_code_seq')::text, 6, '0')) ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
  return (await run(`SELECT ${PROFILE} FROM volunteer_profiles p WHERE p.user_id = $1`, [userId]))[0];
}

export async function updateProfile(userId, { interests, experience, availability }) {
  await ensureProfile(userId);
  await query(
    `UPDATE volunteer_profiles SET interests = COALESCE($2, interests), experience = COALESCE($3, experience), availability = COALESCE($4, availability), updated_at = NOW() WHERE user_id = $1`,
    [userId, interests ?? null, experience ?? null, availability ?? null],
  );
  return (await query(`SELECT ${PROFILE} FROM volunteer_profiles p WHERE p.user_id = $1`, [userId]))[0];
}

export async function setProfileStatus(userId, status) {
  await ensureProfile(userId);
  await query(`UPDATE volunteer_profiles SET status = $2, updated_at = NOW() WHERE user_id = $1`, [userId, status]);
}

export async function isSuspended(userId) {
  return (await query(`SELECT 1 FROM volunteer_profiles WHERE user_id = $1 AND status = 'suspended'`, [userId])).length > 0;
}

/* ------------------------------------------------------------ departments */

const DEPARTMENT = `d.id, d.event_id AS "eventId", d.name, d.description, d.required_count AS "requiredCount", d.location,
  to_char(d.shift_start, 'HH24:MI') AS "shiftStart", to_char(d.shift_end, 'HH24:MI') AS "shiftEnd", d.instructions, d.priority, d.created_at AS "createdAt"`;

export async function listDepartments(eventId) {
  return query(
    `SELECT ${DEPARTMENT},
            (SELECT COUNT(DISTINCT a.user_id)::int FROM volunteer_assignments a WHERE a.department_id = d.id AND a.status = ANY($2)) AS assigned,
            (SELECT COUNT(DISTINCT a.user_id)::int FROM volunteer_assignments a WHERE a.department_id = d.id AND a.status = 'accepted') AS accepted,
            (SELECT COUNT(*)::int FROM volunteer_tasks k WHERE k.department_id = d.id AND k.status IN ('assigned', 'accepted', 'in_progress')) AS "openTasks"
       FROM volunteer_departments d WHERE d.event_id = $1 ORDER BY d.created_at, d.id`,
    [eventId, COUNTED],
  );
}

export async function findDepartment(id) {
  return (await query(`SELECT ${DEPARTMENT} FROM volunteer_departments d WHERE d.id = $1`, [id]))[0];
}

const dupName = (err) => {
  if (err.code === '23505') throw conflict('This event already has a department with that name', { name: 'That department already exists' });
  throw err;
};

export async function createDepartment(eventId, d) {
  try {
    const rows = await query(
      `INSERT INTO volunteer_departments (event_id, name, description, required_count, location, shift_start, shift_end, instructions, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [eventId, d.name, d.description, d.requiredCount, d.location, d.shiftStart ?? null, d.shiftEnd ?? null, d.instructions, d.priority],
    );
    return findDepartment(rows[0].id);
  } catch (err) {
    return dupName(err);
  }
}

export async function updateDepartment(id, patch) {
  const current = await findDepartment(id);
  if (!current) throw notFound('Department not found');
  const n = { ...current, ...patch };
  if (n.shiftStart && n.shiftEnd && n.shiftEnd <= n.shiftStart) throw unprocessable('Please fix the highlighted fields', { shiftEnd: 'Shift end must be after the start' });
  try {
    await query(
      `UPDATE volunteer_departments SET name = $2, description = $3, required_count = $4, location = $5, shift_start = $6, shift_end = $7, instructions = $8, priority = $9, updated_at = NOW() WHERE id = $1`,
      [id, n.name, n.description, n.requiredCount, n.location, n.shiftStart ?? null, n.shiftEnd ?? null, n.instructions, n.priority],
    );
  } catch (err) {
    return dupName(err);
  }
  return findDepartment(id);
}

export async function deleteDepartment(id) {
  const used = (await query(`SELECT COUNT(*)::int AS n FROM volunteer_assignments WHERE department_id = $1 AND status = ANY($2)`, [id, LIVE]))[0].n;
  if (used) throw conflict(`This department still has ${used} active assignment${used === 1 ? '' : 's'}. Reassign or remove them first.`);
  const rows = await query(`DELETE FROM volunteer_departments WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) throw notFound('Department not found');
}

/* ----------------------------------------------------------------- shifts */

const SHIFT = `s.id, s.event_id AS "eventId", s.department_id AS "departmentId", d.name AS "departmentName", s.name, to_char(s.date, 'YYYY-MM-DD') AS date,
  to_char(s.start_time, 'HH24:MI') AS "startTime", to_char(s.end_time, 'HH24:MI') AS "endTime", s.required_count AS "requiredCount"`;

export const listShifts = (eventId) =>
  query(
    `SELECT ${SHIFT}, (SELECT COUNT(*)::int FROM volunteer_assignments a WHERE a.shift_id = s.id AND a.status = ANY($2)) AS assigned
       FROM volunteer_shifts s JOIN volunteer_departments d ON d.id = s.department_id WHERE s.event_id = $1 ORDER BY s.date, s.start_time, d.name`,
    [eventId, COUNTED],
  ).then((rows) => rows.map((r) => ({ ...r, available: Math.max(r.requiredCount - r.assigned, 0) })));

export async function findShift(id) {
  return (await query(`SELECT ${SHIFT} FROM volunteer_shifts s JOIN volunteer_departments d ON d.id = s.department_id WHERE s.id = $1`, [id]))[0];
}

export async function createShift(eventId, s) {
  const rows = await query(
    `INSERT INTO volunteer_shifts (event_id, department_id, name, date, start_time, end_time, required_count) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [eventId, s.departmentId, s.name, s.date, s.startTime, s.endTime, s.requiredCount],
  );
  return findShift(rows[0].id);
}

export async function updateShift(id, patch) {
  const current = await findShift(id);
  if (!current) throw notFound('Shift not found');
  const n = { ...current, ...patch };
  if (n.endTime <= n.startTime) throw unprocessable('Please fix the highlighted fields', { endTime: 'End time must be after the start time' });
  await query(`UPDATE volunteer_shifts SET name = $2, date = $3, start_time = $4, end_time = $5, required_count = $6 WHERE id = $1`, [id, n.name, n.date, n.startTime, n.endTime, n.requiredCount]);
  return findShift(id);
}

export async function deleteShift(id) {
  const rows = await query(`DELETE FROM volunteer_shifts WHERE id = $1 RETURNING id`, [id]);
  if (!rows[0]) throw notFound('Shift not found');
}

/* ------------------------------------------------------------ assignments */

const ASSIGNMENT = `
  SELECT a.id, a.event_id AS "eventId", e.name AS "eventName", e.organizer_id AS "organizerId", e.organizer_name AS "organizerName", e.organizer_contact AS "organizerContact",
         a.user_id AS "userId", u.name AS "volunteerName", u.email AS "volunteerEmail", p.volunteer_code AS "volunteerCode",
         a.department_id AS "departmentId", d.name AS "departmentName", d.instructions AS "departmentInstructions",
         a.shift_id AS "shiftId", s.name AS "shiftName",
         a.task, to_char(a.date, 'YYYY-MM-DD') AS date, to_char(a.start_time, 'HH24:MI') AS "startTime", to_char(a.end_time, 'HH24:MI') AS "endTime",
         a.location, a.status, a.accepted_at AS "acceptedAt", a.created_at AS "createdAt",
         t.check_in_time AS "checkInTime", t.check_out_time AS "checkOutTime", COALESCE(t.late, FALSE) AS late, COALESCE(t.on_break, FALSE) AS "onBreak",
         (SELECT COUNT(*)::int FROM volunteer_tasks k WHERE k.user_id = a.user_id AND k.department_id = a.department_id AND k.event_id = a.event_id AND k.status = 'in_progress') AS "tasksInProgress"
    FROM volunteer_assignments a
    JOIN events e ON e.id = a.event_id
    JOIN users u ON u.id = a.user_id
    LEFT JOIN volunteer_profiles p ON p.user_id = a.user_id
    JOIN volunteer_departments d ON d.id = a.department_id
    LEFT JOIN volunteer_shifts s ON s.id = a.shift_id
    LEFT JOIN volunteer_attendance t ON t.assignment_id = a.id`;

export const findAssignment = async (id) => (await query(`${ASSIGNMENT} WHERE a.id = $1`, [id]))[0];

export function listAssignments(eventId, { userId, date, includeRemoved = false } = {}) {
  return query(
    `${ASSIGNMENT} WHERE a.event_id = $1 AND ($2::int IS NULL OR a.user_id = $2) AND ($3::date IS NULL OR a.date = $3::date) AND ($4 OR a.status NOT IN ('removed', 'cancelled'))
      ORDER BY a.date, a.start_time, u.name`,
    [eventId, userId ?? null, date ?? null, includeRemoved],
  );
}

/** A volunteer's own duties across events, soonest first. */
export const assignmentsForUser = (userId) =>
  query(`${ASSIGNMENT} WHERE a.user_id = $1 AND a.status NOT IN ('removed', 'cancelled') ORDER BY a.date, a.start_time`, [userId]);

/** Where is this duty in its life, from the volunteer's side? Null once it was removed. */
export function liveStatus(a, now = localNow()) {
  if (['removed', 'cancelled'].includes(a.status)) return null;
  if (a.checkOutTime || a.status === 'completed') return 'completed';
  if (a.checkInTime) return a.onBreak ? 'on_break' : a.tasksInProgress > 0 ? 'active' : 'checked_in';
  const ended = a.date < now.date || (a.date === now.date && a.endTime <= now.time);
  return ended ? 'absent' : 'assigned';
}

/** NOT_CHECKED_IN, CHECKED_IN, CHECKED_OUT or ABSENT for the attendance column. */
export function attendanceState(a, now = localNow()) {
  if (a.checkOutTime) return 'checked_out';
  if (a.checkInTime) return 'checked_in';
  return liveStatus(a, now) === 'absent' ? 'absent' : 'not_checked_in';
}

const dayOf = (event, date) => date >= event.date && date <= (event.endDate || event.date);

/** How many slots a shift (or, with no shift, a department) has, and how many are taken. */
async function slots(run, { departmentId, shiftId, excludeId = null }) {
  if (shiftId) {
    const shift = (await run(`SELECT required_count AS required FROM volunteer_shifts WHERE id = $1`, [shiftId]))[0];
    const used = (await run(`SELECT COUNT(*)::int AS n FROM volunteer_assignments WHERE shift_id = $1 AND status = ANY($2) AND ($3::int IS NULL OR id <> $3)`, [shiftId, COUNTED, excludeId]))[0].n;
    return { required: shift.required, used, scope: 'shift' };
  }
  const dept = (await run(`SELECT required_count AS required FROM volunteer_departments WHERE id = $1`, [departmentId]))[0];
  const used = (await run(`SELECT COUNT(DISTINCT user_id)::int AS n FROM volunteer_assignments WHERE department_id = $1 AND status = ANY($2) AND ($3::int IS NULL OR id <> $3)`, [departmentId, COUNTED, excludeId]))[0].n;
  return { required: dept.required, used, scope: 'department' };
}

/**
 * Check everything about a duty before it is written. Throws a clear 409/422 and writes nothing.
 * Returns the resolved department, shift and volunteer.
 */
async function validateDuty(run, event, d, { excludeId = null, checkCapacity = true } = {}) {
  const volunteer = (await run(
    `SELECT u.id, u.name, s.is_active AS "isActive" FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = $1 AND s.user_id = $2 AND s.staff_role = 'volunteer'`,
    [event.id, d.userId],
  ))[0];
  if (!volunteer) throw unprocessable('Please fix the highlighted fields', { userId: 'Choose one of this event\'s approved volunteers' });
  if (!volunteer.isActive) throw conflict(`${volunteer.name} is deactivated for this event, so they cannot receive new assignments`, { userId: 'This volunteer is deactivated' });
  if ((await run(`SELECT 1 FROM volunteer_profiles WHERE user_id = $1 AND status = 'suspended'`, [d.userId])).length) {
    throw conflict(`${volunteer.name} has been suspended from volunteering by an administrator`, { userId: 'This volunteer is suspended' });
  }

  const dept = (await run(`SELECT id, name FROM volunteer_departments WHERE id = $1 AND event_id = $2`, [d.departmentId, event.id]))[0];
  if (!dept) throw unprocessable('Please fix the highlighted fields', { departmentId: 'Choose one of this event\'s departments' });
  if (d.shiftId) {
    const shift = (await run(`SELECT id FROM volunteer_shifts WHERE id = $1 AND event_id = $2 AND department_id = $3`, [d.shiftId, event.id, d.departmentId]))[0];
    if (!shift) throw unprocessable('Please fix the highlighted fields', { shiftId: 'That shift does not belong to this department' });
  }
  if (!dayOf(event, d.date)) throw unprocessable('Please fix the highlighted fields', { date: 'Pick one of the event days' });
  if (d.endTime <= d.startTime) throw unprocessable('Please fix the highlighted fields', { endTime: 'End time must be after the start time' });

  // A volunteer cannot be in two places at once, in this event or any other.
  const clash = (await run(
    `SELECT a.id, to_char(a.start_time, 'HH24:MI') AS "startTime", to_char(a.end_time, 'HH24:MI') AS "endTime", d.name AS department, e.name AS event
       FROM volunteer_assignments a JOIN volunteer_departments d ON d.id = a.department_id JOIN events e ON e.id = a.event_id
      WHERE a.user_id = $1 AND a.date = $2::date AND a.status = ANY($3) AND a.start_time < $5::time AND a.end_time > $4::time AND ($6::int IS NULL OR a.id <> $6)
      LIMIT 1`,
    [d.userId, d.date, LIVE, d.startTime, d.endTime, excludeId],
  ))[0];
  if (clash) {
    throw conflict(`${volunteer.name} already has a shift from ${clash.startTime} to ${clash.endTime} on that day (${clash.department}, ${clash.event}). Shifts cannot overlap.`, { startTime: 'Overlaps another shift for this volunteer' });
  }

  if (checkCapacity) {
    const s = await slots(run, { departmentId: d.departmentId, shiftId: d.shiftId, excludeId });
    if (s.used >= s.required && !d.allowOverflow) {
      throw conflict(`This ${s.scope} needs ${s.required} volunteer${s.required === 1 ? '' : 's'} and already has ${s.used}. Tick "allow extra volunteer" to go over.`, { departmentId: `The ${s.scope} is full` });
    }
  }
  return { volunteer, dept };
}

export async function createAssignment(event, d, actorId) {
  return transaction(async (run) => {
    const { volunteer, dept } = await validateDuty(run, event, d);
    const rows = await run(
      `INSERT INTO volunteer_assignments (event_id, user_id, department_id, shift_id, task, date, start_time, end_time, location, assigned_by)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8::time, $9, $10) RETURNING id`,
      [event.id, d.userId, d.departmentId, d.shiftId ?? null, d.task, d.date, d.startTime, d.endTime, d.location, actorId],
    );
    await ensureProfile(d.userId, run);
    await audit(run, { eventId: event.id, actorId, userId: d.userId, action: 'assignment_created', message: `Assigned to ${dept.name}, ${d.date} ${d.startTime}-${d.endTime}${d.allowOverflow ? ' (over the required number)' : ''}`, meta: { assignmentId: rows[0].id } });
    return (await run(`${ASSIGNMENT} WHERE a.id = $1`, [rows[0].id]))[0];
  });
}

/** Change a duty: the volunteer, the department, the shift, the time or the place. Needs re-acceptance. */
export async function updateAssignment(event, current, patch, actorId) {
  if (!LIVE.includes(current.status)) throw conflict(`This assignment is ${current.status}, so it can no longer be changed`);
  if (current.checkInTime) throw conflict('The volunteer has already checked in, so this duty can no longer be changed');
  const next = {
    userId: patch.userId ?? current.userId,
    departmentId: patch.departmentId ?? current.departmentId,
    shiftId: patch.shiftId === undefined ? current.shiftId : patch.shiftId,
    date: patch.date ?? current.date,
    startTime: patch.startTime ?? current.startTime,
    endTime: patch.endTime ?? current.endTime,
    location: patch.location ?? current.location,
    task: patch.task ?? current.task,
    allowOverflow: patch.allowOverflow,
  };
  const moved = ['userId', 'departmentId', 'shiftId', 'date', 'startTime', 'endTime'].some((k) => next[k] !== current[k]);
  return transaction(async (run) => {
    const { dept } = await validateDuty(run, event, next, { excludeId: current.id, checkCapacity: moved });
    await run(
      `UPDATE volunteer_assignments SET user_id = $2, department_id = $3, shift_id = $4, task = $5, date = $6::date, start_time = $7::time, end_time = $8::time, location = $9,
              status = CASE WHEN $10 THEN 'assigned' ELSE status END, accepted_at = CASE WHEN $10 THEN NULL ELSE accepted_at END, updated_at = NOW() WHERE id = $1`,
      [current.id, next.userId, next.departmentId, next.shiftId ?? null, next.task, next.date, next.startTime, next.endTime, next.location, moved],
    );
    const who = next.userId !== current.userId ? ` Volunteer changed from ${current.volunteerName}.` : '';
    await audit(run, { eventId: event.id, actorId, userId: next.userId, action: 'assignment_changed', message: `Assignment changed: ${dept.name}, ${next.date} ${next.startTime}-${next.endTime}.${who}`, meta: { assignmentId: current.id, previousUserId: current.userId } });
    return (await run(`${ASSIGNMENT} WHERE a.id = $1`, [current.id]))[0];
  });
}

/** The writes behind taking a duty away, usable inside a larger transaction. */
export async function releaseInTx(run, current, actorId, reason) {
  await run(`UPDATE volunteer_assignments SET status = 'removed', updated_at = NOW() WHERE id = $1`, [current.id]);
  // Tasks that were never started go with the duty.
  await run(`UPDATE volunteer_tasks SET status = 'cancelled', updated_at = NOW() WHERE event_id = $1 AND user_id = $2 AND department_id = $3 AND status IN ('assigned', 'accepted')`, [current.eventId, current.userId, current.departmentId]);
  await run(`UPDATE volunteer_reassignment_requests SET status = 'rejected', review_note = 'The assignment was removed', reviewed_at = NOW() WHERE assignment_id = $1 AND status = 'requested'`, [current.id]);
  await audit(run, { eventId: current.eventId, actorId, userId: current.userId, action: 'assignment_removed', message: `${reason}: ${current.departmentName}, ${current.date} ${current.startTime}-${current.endTime}`, meta: { assignmentId: current.id } });
}

export function assertRemovable(current) {
  if (!LIVE.includes(current.status)) throw conflict(`This assignment is already ${current.status}`);
  if (current.checkInTime && !current.checkOutTime) throw conflict('The volunteer is on duty right now. Check them out first.');
}

/** Take the duty away. It is kept (status removed) so the history and the audit trail stay intact. */
export async function removeAssignment(current, actorId, reason = 'Removed by the organizer') {
  assertRemovable(current);
  await transaction((run) => releaseInTx(run, current, actorId, reason));
}

export async function accept(current) {
  return transaction(async (run) => {
    const rows = await run(`UPDATE volunteer_assignments SET status = 'accepted', accepted_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'assigned' RETURNING id`, [current.id]);
    if (!rows[0]) return undefined;
    await audit(run, { eventId: current.eventId, actorId: current.userId, userId: current.userId, action: 'assignment_accepted', message: `Accepted the ${current.departmentName} assignment` });
    return (await run(`${ASSIGNMENT} WHERE a.id = $1`, [current.id]))[0];
  });
}

/* ------------------------------------------------------------- attendance */

/** Is now a good time to check in? Opens a little before the shift, closes when it ends. */
export function checkInWindow(a, settings, now = localNow()) {
  if (a.date !== now.date) return { ok: false, reason: a.date > now.date ? `Your duty is on ${a.date}. Check-in opens on the day.` : 'This duty date has passed.' };
  const start = minutesOfDay(a.startTime);
  const end = minutesOfDay(a.endTime);
  const current = minutesOfDay(now.time);
  if (current < start - settings.earlyCheckInMinutes) return { ok: false, reason: `Check-in opens at ${clock(start - settings.earlyCheckInMinutes)}.` };
  if (current >= end) return { ok: false, reason: 'This shift has ended.' };
  return { ok: true, late: current > start + settings.lateGraceMinutes };
}

export async function checkIn(a, { byUserId = null, now = localNow(), settings, override = false }) {
  if (!['assigned', 'accepted'].includes(a.status)) throw conflict(`This assignment is ${a.status}`);
  if (a.checkInTime) throw conflict('Already checked in');
  if (!override && a.status !== 'accepted') throw conflict('Accept your assignment before checking in');
  const window = checkInWindow(a, settings, now);
  if (!override && !window.ok) throw conflict(window.reason);
  return transaction(async (run) => {
    await run(`UPDATE volunteer_assignments SET status = 'accepted', accepted_at = COALESCE(accepted_at, NOW()), updated_at = NOW() WHERE id = $1`, [a.id]);
    await run(
      `INSERT INTO volunteer_attendance (assignment_id, user_id, event_id, late, location, checked_in_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [a.id, a.userId, a.eventId, Boolean(window.late), a.location, byUserId],
    );
    await audit(run, { eventId: a.eventId, actorId: byUserId ?? a.userId, userId: a.userId, action: 'checked_in', message: `Checked in${window.late ? ' (late)' : ''}${byUserId ? ' by the organizer' : ''}`, meta: { assignmentId: a.id } });
    return (await run(`${ASSIGNMENT} WHERE a.id = $1`, [a.id]))[0];
  });
}

export async function checkOut(a, { byUserId = null }) {
  if (!a.checkInTime) throw conflict('Check in before checking out');
  if (a.checkOutTime) throw conflict('Already checked out');
  return transaction(async (run) => {
    await run(`UPDATE volunteer_attendance SET check_out_time = GREATEST(NOW(), check_in_time), on_break = FALSE, checked_out_by = $2 WHERE assignment_id = $1`, [a.id, byUserId]);
    await run(`UPDATE volunteer_assignments SET status = 'completed', updated_at = NOW() WHERE id = $1`, [a.id]);
    await audit(run, { eventId: a.eventId, actorId: byUserId ?? a.userId, userId: a.userId, action: 'checked_out', message: `Checked out${byUserId ? ' by the organizer' : ''}`, meta: { assignmentId: a.id } });
    return (await run(`${ASSIGNMENT} WHERE a.id = $1`, [a.id]))[0];
  });
}

export async function setBreak(a, onBreak) {
  if (!a.checkInTime || a.checkOutTime) throw conflict('You can only take a break while you are on duty');
  await query(`UPDATE volunteer_attendance SET on_break = $2 WHERE assignment_id = $1`, [a.id, onBreak]);
  return findAssignment(a.id);
}

/** Minutes between check-in and check-out (or now, while still on duty). */
export const dutyMinutes = (a, now = new Date()) => (a.checkInTime ? Math.max(Math.round(((a.checkOutTime ? new Date(a.checkOutTime) : now) - new Date(a.checkInTime)) / 60000), 0) : 0);

/** Attendance for one day: who is on duty, who is late, absent or not in yet. */
export async function attendanceForDay(eventId, date, now = localNow()) {
  const rows = await listAssignments(eventId, { date });
  const list = rows.map((a) => ({ ...a, state: attendanceState(a, now), liveStatus: liveStatus(a, now), minutes: dutyMinutes(a) }));
  const count = (fn) => list.filter(fn).length;
  return {
    date,
    summary: {
      total: new Set(list.map((a) => a.userId)).size,
      checkedIn: count((a) => a.checkInTime),
      late: count((a) => a.late),
      absent: count((a) => a.state === 'absent'),
      notCheckedIn: count((a) => a.state === 'not_checked_in'),
    },
    rows: list,
  };
}

/** The newest duties across all events, for the admin activity view. */
export const listRecentAssignments = ({ eventId = null, limit = 200 } = {}) =>
  query(`${ASSIGNMENT} WHERE ($1::int IS NULL OR a.event_id = $1) ORDER BY a.created_at DESC, a.id DESC LIMIT ${Math.min(limit, 500)}`, [eventId]);
