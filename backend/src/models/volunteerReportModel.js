import { query } from '../db.js';
import { localNow } from '../utils/eventStatus.js';
import { COUNTED, attendanceState, dutyMinutes, listAssignments, listDepartments, liveStatus, minutesOfDay } from './volunteerOpsModel.js';
import { OPEN, listTasks } from './volunteerTaskModel.js';

const round1 = (n) => Math.round(n * 10) / 10;
const hours = (minutes) => round1(minutes / 60);

/** Who the event has as volunteers, active or not. */
const volunteersOf = (eventId) =>
  query(`SELECT s.user_id AS "userId", s.is_active AS "isActive" FROM event_staff s WHERE s.event_id = $1 AND s.staff_role = 'volunteer'`, [eventId]);

const isOverdue = (t, now) => OPEN.includes(t.status) && (t.date < now.date || (t.date === now.date && t.endTime < now.time));

/**
 * The organizer's picture of the volunteer team for one event: totals, how full each department is,
 * and what needs attention. Everything is counted from the records; nothing is estimated.
 *  - assigned: has at least one duty; unassigned: approved but with no duty yet
 *  - checkedIn: has checked in today; active: on duty right now (checked in, not out, not on a break)
 */
export async function overview(event, now = localNow(), settings = { lateGraceMinutes: 10 }) {
  const [people, assignments, tasks, departments] = await Promise.all([volunteersOf(event.id), listAssignments(event.id), listTasks(event.id), listDepartments(event.id)]);
  const active = people.filter((p) => p.isActive).map((p) => p.userId);
  const activeSet = new Set(active);
  const assigned = new Set(assignments.filter((a) => COUNTED.includes(a.status) && activeSet.has(a.userId)).map((a) => a.userId));
  const today = assignments.filter((a) => a.date === now.date && activeSet.has(a.userId));
  const checkedIn = new Set(today.filter((a) => a.checkInTime).map((a) => a.userId));
  const onDuty = new Set(today.filter((a) => a.checkInTime && !a.checkOutTime && !a.onBreak).map((a) => a.userId));

  const open = tasks.filter((t) => OPEN.includes(t.status));
  const overdue = tasks.filter((t) => isOverdue(t, now));

  const cards = departments.map((d) => {
    const needed = Math.max(d.requiredCount - d.assigned, 0);
    const checkedInHere = new Set(today.filter((a) => a.departmentId === d.id && a.checkInTime).map((a) => a.userId)).size;
    return { id: d.id, name: d.name, requiredCount: d.requiredCount, assigned: d.assigned, accepted: d.accepted, needed, checkedIn: checkedInHere, openTasks: d.openTasks, priority: d.priority, status: d.assigned > d.requiredCount ? 'over' : needed === 0 ? 'complete' : 'needed' };
  });

  // Not in yet although the shift started more than the grace period ago.
  const late = new Set(
    today.filter((a) => liveStatus(a, now) === 'assigned' && minutesOfDay(now.time) > minutesOfDay(a.startTime) + settings.lateGraceMinutes).map((a) => a.userId),
  );
  const alerts = [
    ...cards.filter((c) => c.needed > 0).map((c) => ({ key: `short-${c.id}`, severity: 'warning', message: `${c.name} is short by ${c.needed} volunteer${c.needed === 1 ? '' : 's'}.` })),
    ...(late.size ? [{ key: 'not-checked-in', severity: 'warning', message: `${late.size} volunteer${late.size === 1 ? ' has' : 's have'} not checked in.` }] : []),
    ...[...new Map(overdue.map((t) => [t.departmentName, t])).values()].map((t) => ({ key: `overdue-${t.departmentId}`, severity: 'important', message: `${t.departmentName} task is overdue: ${t.title}.` })),
  ];

  return {
    totals: {
      total: active.length,
      assigned: assigned.size,
      unassigned: active.length - assigned.size,
      checkedIn: checkedIn.size,
      active: onDuty.size,
      tasksPending: open.length,
      tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
      urgentTasks: open.filter((t) => t.priority === 'urgent').length,
      overdueTasks: overdue.length,
    },
    departments: cards,
    alerts,
  };
}

/** The slice the Event Command Center shows. */
export async function commandCenter(event, now, settings) {
  const o = await overview(event, now, settings);
  const t = o.totals;
  return { total: t.total, assigned: t.assigned, unassigned: t.unassigned, checkedIn: t.checkedIn, active: t.active, pendingTasks: t.tasksPending, urgentTasks: t.urgentTasks, overdueTasks: t.overdueTasks, alerts: o.alerts };
}

/* -------------------------------------------------------------- analytics */

const tally = (rows, key) => {
  const m = new Map();
  for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1);
  return m;
};

/**
 * Reports for one event, or (no eventId) the whole platform. Hours come from check-in and check-out
 * times; an open duty counts up to now.
 */
export async function analytics({ eventId = null } = {}, now = localNow()) {
  const filter = eventId ? 'WHERE a.event_id = $1' : '';
  const params = eventId ? [eventId] : [];
  const [people, assignments, tasks, attendance] = await Promise.all([
    query(`SELECT s.user_id AS "userId", s.event_id AS "eventId", s.is_active AS "isActive" FROM event_staff s WHERE s.staff_role = 'volunteer' ${eventId ? 'AND s.event_id = $1' : ''}`, params),
    query(
      `SELECT a.id, a.event_id AS "eventId", e.name AS "eventName", a.user_id AS "userId", u.name AS "volunteerName", d.name AS department, a.status,
              to_char(a.date, 'YYYY-MM-DD') AS date, to_char(a.start_time, 'HH24:MI') AS "startTime", to_char(a.end_time, 'HH24:MI') AS "endTime",
              t.check_in_time AS "checkInTime", t.check_out_time AS "checkOutTime"
         FROM volunteer_assignments a JOIN events e ON e.id = a.event_id JOIN users u ON u.id = a.user_id JOIN volunteer_departments d ON d.id = a.department_id
         LEFT JOIN volunteer_attendance t ON t.assignment_id = a.id ${filter ? `${filter} AND` : 'WHERE'} a.status NOT IN ('removed', 'cancelled')`,
      params,
    ),
    query(
      `SELECT k.status, k.event_id AS "eventId", d.name AS department FROM volunteer_tasks k JOIN volunteer_departments d ON d.id = k.department_id ${eventId ? 'WHERE k.event_id = $1' : ''}`,
      params,
    ),
    query(`SELECT check_in_time AS "at", check_out_time AS "out", user_id AS "userId" FROM volunteer_attendance ${eventId ? 'WHERE event_id = $1' : ''}`, params),
  ]);

  const activePeople = people.filter((p) => p.isActive);
  const due = assignments.filter((a) => a.date <= now.date);
  const attended = due.filter((a) => a.checkInTime);
  const minutes = (a) => dutyMinutes({ checkInTime: a.checkInTime, checkOutTime: a.checkOutTime });
  const totalMinutes = assignments.filter((a) => a.checkInTime).reduce((n, a) => n + minutes(a), 0);

  const byDept = new Map();
  for (const a of assignments.filter((x) => COUNTED.includes(x.status))) {
    const row = byDept.get(a.department) ?? { label: a.department, volunteers: new Set(), scheduledMinutes: 0, hoursWorked: 0 };
    row.volunteers.add(a.userId);
    row.scheduledMinutes += minutesOfDay(a.endTime) - minutesOfDay(a.startTime);
    if (a.checkInTime) row.hoursWorked += minutes(a);
    byDept.set(a.department, row);
  }
  const taskRows = new Map();
  for (const t of tasks) {
    const r = taskRows.get(t.department) ?? { label: t.department, completed: 0, pending: 0 };
    if (t.status === 'completed') r.completed += 1;
    else if (OPEN.includes(t.status)) r.pending += 1;
    taskRows.set(t.department, r);
  }

  const perVolunteer = new Map();
  for (const a of assignments.filter((x) => x.checkInTime)) perVolunteer.set(a.volunteerName, (perVolunteer.get(a.volunteerName) ?? 0) + minutes(a));

  // Check-ins by the hour they happened, in the server's local time.
  const hourly = tally(attendance.map((r) => ({ hour: new Date(r.at).getHours() })), 'hour');

  const result = {
    totals: {
      totalVolunteers: new Set(activePeople.map((p) => p.userId)).size,
      activeVolunteers: new Set(attendance.filter((r) => !r.out).map((r) => r.userId)).size,
      averageAttendance: due.length ? round1((attended.length / due.length) * 100) : null,
      averageHours: attended.length ? hours(totalMinutes / attended.length) : null,
      totalHours: hours(totalMinutes),
      tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
      tasksPending: tasks.filter((t) => OPEN.includes(t.status)).length,
    },
    departmentDistribution: [...byDept.values()].map((d) => ({ label: d.label, count: d.volunteers.size })).sort((a, b) => b.count - a.count),
    attendanceByHour: [...hourly.entries()].sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ label: `${String(hour).padStart(2, '0')}:00`, count })),
    tasksByDepartment: [...taskRows.values()].sort((a, b) => b.completed + b.pending - (a.completed + a.pending)),
    volunteerHours: [...perVolunteer.entries()].map(([label, m]) => ({ label, hours: hours(m) })).sort((a, b) => b.hours - a.hours).slice(0, 10),
    departmentWorkload: [...byDept.values()].map((d) => ({ label: d.label, scheduledHours: hours(d.scheduledMinutes), workedHours: hours(d.hoursWorked), volunteers: d.volunteers.size })).sort((a, b) => b.scheduledHours - a.scheduledHours),
  };

  if (!eventId) {
    const byEvent = new Map();
    for (const a of assignments) {
      const row = byEvent.get(a.eventId) ?? { eventId: a.eventId, label: a.eventName, volunteers: new Set(), minutes: 0 };
      row.volunteers.add(a.userId);
      if (a.checkInTime) row.minutes += minutes(a);
      byEvent.set(a.eventId, row);
    }
    result.byEvent = [...byEvent.values()].map((e) => ({ eventId: e.eventId, label: e.label, volunteers: e.volunteers.size, hours: hours(e.minutes) })).sort((a, b) => b.volunteers - a.volunteers).slice(0, 10);
  }
  return result;
}

/** A volunteer's own record: duties, hours and tasks, across every event. */
export async function volunteerSummary(userId) {
  const [assignments, tasks] = await Promise.all([
    query(
      `SELECT a.id, t.check_in_time AS "checkInTime", t.check_out_time AS "checkOutTime", a.status FROM volunteer_assignments a LEFT JOIN volunteer_attendance t ON t.assignment_id = a.id WHERE a.user_id = $1 AND a.status NOT IN ('removed', 'cancelled')`,
      [userId],
    ),
    query(`SELECT status FROM volunteer_tasks WHERE user_id = $1`, [userId]),
  ]);
  const minutes = assignments.filter((a) => a.checkInTime).reduce((n, a) => n + dutyMinutes(a), 0);
  return {
    duties: assignments.length,
    completedDuties: assignments.filter((a) => a.status === 'completed').length,
    hours: hours(minutes),
    tasksCompleted: tasks.filter((t) => t.status === 'completed').length,
    tasksOpen: tasks.filter((t) => OPEN.includes(t.status)).length,
  };
}

export { attendanceState, liveStatus };
