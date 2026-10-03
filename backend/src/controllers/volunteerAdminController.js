import { query } from '../db.js';
import * as ops from '../models/volunteerOpsModel.js';
import * as reports from '../models/volunteerReportModel.js';
import * as alerts from '../services/volunteerNotifications.js';
import { localNow } from '../utils/eventStatus.js';
import { conflict, notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

/** Platform-wide numbers. Admins see what the volunteers did, across every event. */
export async function analytics(_req, res) {
  res.json(await reports.analytics({}, localNow()));
}

/** Every recent duty and the audit trail, for handling volunteer-related issues. */
export async function activity(req, res) {
  const eventId = req.query.eventId ?? null;
  const now = localNow();
  const [assignments, log] = await Promise.all([ops.listRecentAssignments({ eventId }), ops.auditLog({ eventId, limit: 200 })]);
  res.json({
    assignments: assignments.map((a) => ({
      id: a.id, eventId: a.eventId, eventName: a.eventName, volunteerName: a.volunteerName, volunteerCode: a.volunteerCode, department: a.departmentName,
      date: a.date, startTime: a.startTime, endTime: a.endTime, location: a.location, status: a.status, liveStatus: ops.liveStatus(a, now), attendance: ops.attendanceState(a, now), late: a.late,
    })),
    log,
  });
}

export async function audit(req, res) {
  res.json({ log: await ops.auditLog({ eventId: req.query.eventId ?? null, limit: 500 }) });
}

/** Everyone who has a volunteer profile, with how much they have done. */
export async function volunteers(req, res) {
  const rows = await query(
    `SELECT p.user_id AS "userId", u.name, u.email, p.volunteer_code AS "volunteerCode", p.status,
            (SELECT COUNT(DISTINCT s.event_id)::int FROM event_staff s WHERE s.user_id = p.user_id AND s.staff_role = 'volunteer' AND s.is_active) AS events,
            (SELECT COUNT(*)::int FROM volunteer_assignments a WHERE a.user_id = p.user_id AND a.status IN ('assigned', 'accepted', 'completed')) AS duties,
            (SELECT COUNT(*)::int FROM volunteer_tasks k WHERE k.user_id = p.user_id AND k.status = 'completed') AS "tasksCompleted"
       FROM volunteer_profiles p JOIN users u ON u.id = p.user_id
      ORDER BY u.name`,
  );
  const q = req.query.search?.toLowerCase();
  res.json({ volunteers: q ? rows.filter((r) => [r.name, r.email, r.volunteerCode].some((v) => String(v).toLowerCase().includes(q))) : rows });
}

/** Switch someone off volunteering platform-wide. Their unstarted duties are released. */
export async function setVolunteerStatus(req, res) {
  const userId = idParam(req.params.userId, 'Volunteer');
  if (!(await query(`SELECT 1 FROM volunteer_profiles WHERE user_id = $1`, [userId])).length) throw notFound('Volunteer not found');
  await ops.setProfileStatus(userId, req.body.status);
  if (req.body.status === 'suspended') {
    const open = (await query(`SELECT id FROM volunteer_assignments WHERE user_id = $1 AND status IN ('assigned', 'accepted')`, [userId])).map((r) => r.id);
    for (const id of open) {
      const a = await ops.findAssignment(id);
      // On duty right now: the organizer checks them out first.
      if (a.checkInTime && !a.checkOutTime) continue;
      await ops.removeAssignment(a, req.user.id, 'Volunteer suspended by an administrator');
      await alerts.removed(a);
    }
  }
  await query(`INSERT INTO volunteer_audit (actor_id, user_id, action, message) VALUES ($1, $2, $3, $4)`, [
    req.user.id, userId, `volunteer_${req.body.status}`, req.body.status === 'suspended' ? 'Volunteer suspended by an administrator' : 'Volunteer access restored by an administrator',
  ]);
  res.json({ ok: true, status: req.body.status });
}

export async function listCategories(_req, res) {
  res.json({ categories: await query(`SELECT id, name, description, instructions, is_active AS "isActive" FROM volunteer_categories ORDER BY name`) });
}

const duplicate = (err) => {
  if (err.code === '23505') throw conflict('There is already a category with that name', { name: 'That category already exists' });
  throw err;
};

export async function createCategory(req, res) {
  try {
    const rows = await query(
      `INSERT INTO volunteer_categories (name, description, instructions) VALUES ($1, $2, $3) RETURNING id, name, description, instructions, is_active AS "isActive"`,
      [req.body.name, req.body.description, req.body.instructions],
    );
    res.status(201).json({ category: rows[0] });
  } catch (err) {
    duplicate(err);
  }
}

export async function updateCategory(req, res) {
  const id = idParam(req.params.id, 'Category');
  const current = (await query(`SELECT id, name, description, instructions, is_active AS "isActive" FROM volunteer_categories WHERE id = $1`, [id]))[0];
  if (!current) throw notFound('Category not found');
  const next = { ...current, ...req.body };
  try {
    await query(`UPDATE volunteer_categories SET name = $2, description = $3, instructions = $4, is_active = $5 WHERE id = $1`, [id, next.name, next.description, next.instructions, next.isActive]);
  } catch (err) {
    duplicate(err);
  }
  res.json({ category: next });
}

export async function getSettings(_req, res) {
  res.json({ settings: await ops.getSettings() });
}

export async function saveSettings(req, res) {
  res.json({ settings: await ops.saveSettings(req.body) });
}
