import { query, transaction } from '../db.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
export const STATUSES = ['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled'];
export const CONTACT_PREFERENCES = ['app', 'in_person', 'call'];
export const ITEM_STATUSES = ['open', 'found', 'claimed', 'returned'];

/** Waiting for someone to start work. */
export const WAITING = ['reported', 'acknowledged', 'assigned'];
/** Not finished yet. */
export const ACTIVE = [...WAITING, 'in_progress'];

/** Which statuses a request may move to, and from where. The server refuses anything else. */
export const TRANSITIONS = {
  reported: ['acknowledged', 'cancelled'],
  acknowledged: ['in_progress', 'resolved', 'cancelled'],
  assigned: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved'],
  resolved: ['closed'],
  closed: [],
  cancelled: [],
};
const sourcesOf = (to) => Object.entries(TRANSITIONS).filter(([, tos]) => tos.includes(to)).map(([from]) => from);
const STAMP = { acknowledged: 'acknowledged_at', in_progress: 'started_at', resolved: 'resolved_at', closed: 'closed_at', cancelled: 'cancelled_at' };

export const DEFAULT_ESCALATION = {
  ackMinutes: { urgent: 2, high: 5 },
  unresolvedMinutes: { urgent: 30, high: 60, medium: 120, low: 240 },
};

const SELECT = `
  SELECT r.id, r.request_code AS "requestCode", r.event_id AS "eventId", e.name AS "eventName", e.organizer_id AS "organizerId",
         r.participant_id AS "participantId", p.name AS "participantName", p.department AS "participantDepartment", p.phone AS "participantPhone",
         c.id AS "categoryId", c.code AS "categoryCode", c.name AS "categoryName", c.icon AS "categoryIcon", c.is_urgent AS "categoryUrgent",
         r.description, r.location, r.priority, r.status, r.contact_preference AS "contactPreference", r.details, r.item_status AS "itemStatus",
         r.assigned_volunteer_id AS "assignedVolunteerId", v.name AS "assignedVolunteerName",
         r.escalated, r.escalated_at AS "escalatedAt",
         r.created_at AS "createdAt", r.acknowledged_at AS "acknowledgedAt", r.assigned_at AS "assignedAt", r.accepted_at AS "acceptedAt",
         r.started_at AS "startedAt", r.resolved_at AS "resolvedAt", r.closed_at AS "closedAt", r.cancelled_at AS "cancelledAt", r.updated_at AS "updatedAt"
    FROM help_requests r
    JOIN events e ON e.id = r.event_id
    JOIN users p ON p.id = r.participant_id
    JOIN help_categories c ON c.id = r.category_id
    LEFT JOIN users v ON v.id = r.assigned_volunteer_id`;

// Waiting urgent requests first, then by age. Finished ones sink to the bottom.
const STAFF_ORDER = `
  ORDER BY CASE WHEN r.status IN ('closed', 'cancelled') THEN 2 WHEN r.status = 'resolved' THEN 1 ELSE 0 END,
           CASE r.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           r.created_at DESC`;

const minutesBetween = (later, earlier) => (later && earlier ? Math.max((new Date(later) - new Date(earlier)) / 60000, 0) : null);

/* ------------------------------------------------------------ categories */

const CATEGORY = `id, code, name, description, icon, priority_level AS "priorityLevel", is_urgent AS "isUrgent", is_active AS "isActive", position`;

export const listCategories = ({ all = false } = {}) =>
  query(`SELECT ${CATEGORY} FROM help_categories ${all ? '' : 'WHERE is_active'} ORDER BY position, id`);

export async function findCategory(id) {
  return (await query(`SELECT ${CATEGORY} FROM help_categories WHERE id = $1`, [id]))[0];
}

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'category';

export async function createCategory({ name, description, icon, priorityLevel, isUrgent }) {
  const position = (await query(`SELECT COALESCE(MAX(position), 0) + 1 AS n FROM help_categories`))[0].n;
  let code = slug(name);
  if ((await query(`SELECT 1 FROM help_categories WHERE code = $1`, [code])).length) code = `${code}_${Date.now().toString(36).slice(-4)}`;
  const rows = await query(
    `INSERT INTO help_categories (code, name, description, icon, priority_level, is_urgent, position) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [code, name, description, icon, priorityLevel, isUrgent, position],
  );
  return findCategory(rows[0].id);
}

export async function updateCategory(id, patch) {
  const current = await findCategory(id);
  if (!current) throw notFound('Category not found');
  const next = { ...current, ...patch };
  await query(
    `UPDATE help_categories SET name = $2, description = $3, icon = $4, priority_level = $5, is_urgent = $6, is_active = $7 WHERE id = $1`,
    [id, next.name, next.description, next.icon, next.priorityLevel, next.isUrgent, next.isActive],
  );
  return findCategory(id);
}

/* ---------------------------------------------------------------- reading */

export async function find(id) {
  return (await query(`${SELECT} WHERE r.id = $1`, [id]))[0];
}

/** The people an event can hand a request to: its volunteers, with their open workload and any admin teams. */
export async function responders(eventId) {
  return query(
    `SELECT u.id, u.name,
            ARRAY(SELECT t.name FROM help_team_members m JOIN help_teams t ON t.id = m.team_id WHERE m.user_id = u.id AND t.is_active ORDER BY t.name) AS teams,
            (SELECT COUNT(*)::int FROM help_requests r WHERE r.assigned_volunteer_id = u.id AND r.status = ANY($2)) AS "openCount"
       FROM event_staff s JOIN users u ON u.id = s.user_id
      WHERE s.event_id = $1 AND s.staff_role = 'volunteer' AND s.is_active
      ORDER BY u.name`,
    [eventId, ACTIVE],
  );
}

export async function isResponder(eventId, userId) {
  return (await query(`SELECT 1 FROM event_staff WHERE event_id = $1 AND user_id = $2 AND staff_role = 'volunteer' AND is_active`, [eventId, userId])).length > 0;
}

function filtersSql(filters, params, startAt = 1) {
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${startAt + params.length - 1}`));
  };
  if (filters.eventId) add('r.event_id = ?', filters.eventId);
  if (filters.organizerId) add('e.organizer_id = ?', filters.organizerId);
  if (filters.status) add('r.status = ?', filters.status);
  if (filters.priority) add('r.priority = ?', filters.priority);
  if (filters.category) add('c.code = ?', filters.category);
  if (filters.state === 'open') add('r.status = ANY(?)', WAITING);
  if (filters.state === 'active') add('r.status = ANY(?)', ACTIVE);
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

/** Requests for staff (organizer or admin views), filtered, most pressing first. */
export async function listFiltered(filters = {}, { limit = 200 } = {}) {
  const params = [];
  const where = filtersSql(filters, params);
  return query(`${SELECT} ${where} ${STAFF_ORDER} LIMIT ${Math.min(limit, 500)}`, params);
}

export const listForParticipant = (userId, eventId = null) =>
  query(`${SELECT} WHERE r.participant_id = $1 AND ($2::int IS NULL OR r.event_id = $2) ORDER BY r.created_at DESC LIMIT 100`, [userId, eventId]);

/** What a volunteer has been handed. Cancelled and closed ones are history, not work. */
export const listForVolunteer = (userId) =>
  query(`${SELECT} WHERE r.assigned_volunteer_id = $1 AND r.status NOT IN ('closed', 'cancelled') ${STAFF_ORDER}`, [userId]);

export async function countActiveForUser(eventId, userId) {
  return (await query(`SELECT COUNT(*)::int AS n FROM help_requests WHERE event_id = $1 AND participant_id = $2 AND status = ANY($3)`, [eventId, userId, ACTIVE]))[0].n;
}

export async function updates(requestId, { staff }) {
  return query(
    `SELECT u.id, u.kind, u.message, u.visibility, u.meta, u.created_at AS "createdAt", u.user_id AS "userId", a.name AS "authorName"
       FROM help_updates u LEFT JOIN users a ON a.id = u.user_id
      WHERE u.request_id = $1 AND ($2 OR u.visibility = 'participant') ORDER BY u.created_at, u.id`,
    [requestId, staff],
  );
}

export const attachments = (requestId) =>
  query(`SELECT id, original_name AS "name", file_type AS "type", size_bytes AS "size", created_at AS "createdAt" FROM help_attachments WHERE request_id = $1 ORDER BY id`, [requestId]);

export async function findAttachment(requestId, id) {
  return (await query(`SELECT id, stored_name AS "storedName", original_name AS "name", file_type AS "type" FROM help_attachments WHERE id = $1 AND request_id = $2`, [id, requestId]))[0];
}

/** Places a participant can pick: the event venue, the venues on its schedule, and its crowd zones. */
export async function locations(event) {
  const rows = await query(
    `SELECT venue AS name FROM schedule_items WHERE event_id = $1 AND venue <> ''
     UNION SELECT name FROM event_zones WHERE event_id = $1`,
    [event.id],
  );
  const seen = new Set();
  return [event.venue, ...rows.map((r) => r.name)]
    .map((name) => String(name ?? '').trim())
    .filter((name) => name && !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()))
    .slice(0, 30);
}

/* ---------------------------------------------------------------- writing */

async function log(run, requestId, userId, kind, message, { visibility = 'participant', meta = {} } = {}) {
  await run(`INSERT INTO help_updates (request_id, user_id, kind, message, visibility, meta) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [
    requestId, userId ?? null, kind, message, visibility, JSON.stringify(meta),
  ]);
}

export async function create({ event, userId, category, description, location, contactPreference, details }) {
  return transaction(async (run) => {
    const rows = await run(
      `INSERT INTO help_requests (request_code, event_id, participant_id, category_id, description, location, priority, contact_preference, details, item_status)
       VALUES ('HELP-' || to_char(NOW(), 'YYYY') || '-' || lpad(nextval('help_request_seq')::text, 6, '0'), $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING id`,
      [event.id, userId, category.id, description, location, category.priorityLevel, contactPreference, JSON.stringify(details ?? {}), category.code === 'lost_found' ? 'open' : null],
    );
    await log(run, rows[0].id, userId, 'created', 'Request submitted');
    return rows[0].id;
  });
}

export async function addAttachment(requestId, file) {
  await query(`INSERT INTO help_attachments (request_id, stored_name, original_name, file_type, size_bytes) VALUES ($1, $2, $3, $4, $5)`, [
    requestId, file.filename, String(file.originalname ?? '').slice(0, 200), file.mimetype, file.size,
  ]);
}

/**
 * Move a request to a new status if the rules allow it. Returns the refreshed row, or undefined when
 * the request was not in a state that can move there (someone else got there first, for instance).
 */
export async function transition(id, to, userId, message = '') {
  const sources = sourcesOf(to);
  return transaction(async (run) => {
    const stamp = STAMP[to];
    // acknowledged_at is always filled on the way through; do not assign the same column twice.
    const sets = [`status = '${to}'`, `${stamp} = COALESCE(${stamp}, NOW())`];
    if (stamp !== 'acknowledged_at') sets.push('acknowledged_at = COALESCE(acknowledged_at, NOW())');
    if (to === 'in_progress') sets.push('accepted_at = CASE WHEN assigned_volunteer_id IS NOT NULL THEN COALESCE(accepted_at, NOW()) ELSE accepted_at END');
    sets.push('updated_at = NOW()');
    const rows = await run(`UPDATE help_requests SET ${sets.join(', ')} WHERE id = $1 AND status = ANY($2) RETURNING id`, [id, sources]);
    if (!rows[0]) return undefined;
    await log(run, id, userId, 'status', message || `Status changed to ${to.replace('_', ' ')}`, { meta: { to } });
    return (await run(`${SELECT} WHERE r.id = $1`, [id]))[0];
  });
}

/** Hand a request to a volunteer. Allowed until work has started. */
export async function assign(id, volunteer, byUserId) {
  return transaction(async (run) => {
    const rows = await run(
      `UPDATE help_requests SET assigned_volunteer_id = $2, assigned_by = $3, assigned_at = NOW(), accepted_at = NULL, status = 'assigned',
              acknowledged_at = COALESCE(acknowledged_at, NOW()), updated_at = NOW()
        WHERE id = $1 AND status = ANY($4) RETURNING id`,
      [id, volunteer.id, byUserId, WAITING],
    );
    if (!rows[0]) return undefined;
    await log(run, id, byUserId, 'assignment', `Assigned to ${volunteer.name}`, { meta: { volunteerId: volunteer.id } });
    return (await run(`${SELECT} WHERE r.id = $1`, [id]))[0];
  });
}

export async function accept(id, volunteerId) {
  return transaction(async (run) => {
    const rows = await run(
      `UPDATE help_requests SET accepted_at = NOW(), updated_at = NOW() WHERE id = $1 AND assigned_volunteer_id = $2 AND status = 'assigned' AND accepted_at IS NULL RETURNING id`,
      [id, volunteerId],
    );
    if (!rows[0]) return undefined;
    await log(run, id, volunteerId, 'update', 'The responder accepted your request');
    return (await run(`${SELECT} WHERE r.id = $1`, [id]))[0];
  });
}

export async function setPriority(id, priority, userId, reason) {
  return transaction(async (run) => {
    const before = (await run(`SELECT priority FROM help_requests WHERE id = $1 AND status = ANY($2) FOR UPDATE`, [id, ACTIVE]))[0];
    if (!before) return undefined;
    await run(`UPDATE help_requests SET priority = $2, updated_at = NOW() WHERE id = $1`, [id, priority]);
    await log(run, id, userId, 'priority', `Priority changed from ${before.priority} to ${priority}${reason ? `: ${reason}` : ''}`, { visibility: 'staff', meta: { from: before.priority, to: priority } });
    return { before: before.priority, request: (await run(`${SELECT} WHERE r.id = $1`, [id]))[0] };
  });
}

/** Flag a request as escalated. `raise` also lifts it to urgent (a person escalating); the timer only flags. */
export async function escalate(id, { userId = null, raise, reason }) {
  return transaction(async (run) => {
    const rows = await run(
      `UPDATE help_requests SET escalated = TRUE, escalated_at = COALESCE(escalated_at, NOW()), priority = CASE WHEN $2 THEN 'urgent' ELSE priority END, updated_at = NOW()
        WHERE id = $1 AND status = ANY($3) RETURNING id`,
      [id, raise, ACTIVE],
    );
    if (!rows[0]) return undefined;
    await log(run, id, userId, 'escalation', reason, { visibility: 'staff', meta: { raised: raise } });
    return (await run(`${SELECT} WHERE r.id = $1`, [id]))[0];
  });
}

export async function addUpdate(id, userId, message, { internal = false } = {}) {
  await transaction((run) => log(run, id, userId, internal ? 'note' : 'update', message, { visibility: internal ? 'staff' : 'participant' }));
}

export async function setItemStatus(id, itemStatus, userId) {
  return transaction(async (run) => {
    const rows = await run(`UPDATE help_requests SET item_status = $2, updated_at = NOW() WHERE id = $1 AND item_status IS NOT NULL RETURNING id`, [id, itemStatus]);
    if (!rows[0]) return undefined;
    await log(run, id, userId, 'item', `Item marked ${itemStatus}`, { meta: { itemStatus } });
    return (await run(`${SELECT} WHERE r.id = $1`, [id]))[0];
  });
}

/* --------------------------------------------------------------- reports */

function scopeSql(scope, params) {
  const where = [];
  if (scope.eventId) { params.push(scope.eventId); where.push(`r.event_id = $${params.length}`); }
  if (scope.organizerId) { params.push(scope.organizerId); where.push(`e.organizer_id = $${params.length}`); }
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}
const FROM = `FROM help_requests r JOIN events e ON e.id = r.event_id JOIN help_categories c ON c.id = r.category_id`;

/** Counts for the dashboards. open = waiting, inProgress = being worked, urgent = urgent and not finished. */
export async function summary(scope = {}) {
  const params = [];
  const where = scopeSql(scope, params);
  const row = (
    await query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE r.status IN ('reported', 'acknowledged', 'assigned'))::int AS open,
              COUNT(*) FILTER (WHERE r.status = 'in_progress')::int AS "inProgress",
              COUNT(*) FILTER (WHERE r.priority = 'urgent' AND r.status IN ('reported', 'acknowledged', 'assigned', 'in_progress'))::int AS urgent,
              COUNT(*) FILTER (WHERE r.status IN ('resolved', 'closed'))::int AS resolved,
              COUNT(*) FILTER (WHERE r.escalated AND r.status IN ('reported', 'acknowledged', 'assigned', 'in_progress'))::int AS escalated
         ${FROM} ${where}`,
      params,
    )
  )[0];
  return row;
}

/** The newest urgent request that is still open, for the Control Center alert. */
export async function latestUrgent(eventId) {
  return (
    await query(
      `SELECT r.id, r.request_code AS "requestCode", c.name AS "categoryName", r.location, r.created_at AS "createdAt"
         ${FROM} WHERE r.event_id = $1 AND r.priority = 'urgent' AND r.status = ANY($2) ORDER BY r.created_at DESC LIMIT 1`,
      [eventId, ACTIVE],
    )
  )[0] ?? null;
}

const share = (rows) => {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return rows.map((r) => ({ ...r, percent: total ? Math.round((r.count / total) * 1000) / 10 : 0 }));
};

export async function analytics(scope = {}) {
  const p = () => [];
  const run = async (select, group, join = '') => {
    const params = p();
    const where = scopeSql(scope, params);
    return query(`${select} ${FROM} ${join} ${where} ${group}`, params);
  };
  const [byCategory, byLocation, byPriority, byEvent, times, workload] = await Promise.all([
    run(`SELECT c.name AS label, COUNT(*)::int AS count`, 'GROUP BY c.name ORDER BY count DESC, c.name'),
    run(`SELECT r.location AS label, COUNT(*)::int AS count`, `GROUP BY r.location ORDER BY count DESC, r.location LIMIT 8`),
    run(`SELECT r.priority AS label, COUNT(*)::int AS count`, 'GROUP BY r.priority'),
    run(`SELECT e.id AS "eventId", e.name AS label, COUNT(*)::int AS count`, 'GROUP BY e.id, e.name ORDER BY count DESC, e.name LIMIT 10'),
    run(
      `SELECT AVG(EXTRACT(EPOCH FROM (r.acknowledged_at - r.created_at))) / 60 AS response, AVG(EXTRACT(EPOCH FROM (r.resolved_at - r.created_at))) / 60 AS resolution`,
      '',
    ),
    run(
      `SELECT v.id AS "userId", v.name,
              COUNT(*)::int AS assigned,
              COUNT(*) FILTER (WHERE r.status IN ('resolved', 'closed'))::int AS resolved,
              COUNT(*) FILTER (WHERE r.status IN ('reported', 'acknowledged', 'assigned', 'in_progress'))::int AS open`,
      'GROUP BY v.id, v.name ORDER BY assigned DESC, v.name',
      'JOIN users v ON v.id = r.assigned_volunteer_id',
    ),
  ]);
  const round = (n) => (n === null || n === undefined ? null : Math.round(Number(n) * 10) / 10);
  return {
    summary: await summary(scope),
    byCategory: share(byCategory),
    byLocation: share(byLocation),
    byPriority: PRIORITIES.map((label) => ({ label, count: byPriority.find((r) => r.label === label)?.count ?? 0 })).reverse(),
    byEvent: scope.eventId ? undefined : byEvent,
    averageResponseMinutes: round(times[0]?.response),
    averageResolutionMinutes: round(times[0]?.resolution),
    volunteerWorkload: workload,
  };
}

/* ------------------------------------------------------ contacts, teams */

const CONTACT = `c.id, c.event_id AS "eventId", e.name AS "eventName", c.name, c.department, c.phone, c.availability, c.description, c.is_active AS "isActive"`;
const CONTACT_FROM = `FROM emergency_contacts c LEFT JOIN events e ON e.id = c.event_id`;

/** Active contacts that apply to an event (its own plus the ones for every event). */
export const contactsForEvent = (eventId) =>
  query(`SELECT ${CONTACT} ${CONTACT_FROM} WHERE c.is_active AND (c.event_id IS NULL OR c.event_id = $1) ORDER BY c.event_id NULLS LAST, c.name`, [eventId]);

export const listContacts = () => query(`SELECT ${CONTACT} ${CONTACT_FROM} ORDER BY c.is_active DESC, c.name`);

async function contactRow(id) {
  return (await query(`SELECT ${CONTACT} ${CONTACT_FROM} WHERE c.id = $1`, [id]))[0];
}

async function assertEvent(eventId) {
  if (eventId && !(await query(`SELECT 1 FROM events WHERE id = $1`, [eventId])).length) throw unprocessable('Please fix the highlighted fields', { eventId: 'That event does not exist' });
}

export async function createContact(data) {
  await assertEvent(data.eventId);
  const rows = await query(
    `INSERT INTO emergency_contacts (event_id, name, department, phone, availability, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [data.eventId ?? null, data.name, data.department, data.phone, data.availability, data.description],
  );
  return contactRow(rows[0].id);
}

export async function updateContact(id, patch) {
  const current = await contactRow(id);
  if (!current) throw notFound('Contact not found');
  const next = { ...current, ...patch };
  await assertEvent(next.eventId);
  await query(
    `UPDATE emergency_contacts SET event_id = $2, name = $3, department = $4, phone = $5, availability = $6, description = $7, is_active = $8 WHERE id = $1`,
    [id, next.eventId ?? null, next.name, next.department, next.phone, next.availability, next.description, next.isActive],
  );
  return contactRow(id);
}

export async function listTeams() {
  const teams = await query(`SELECT id, name, description, is_active AS "isActive" FROM help_teams ORDER BY name`);
  const members = await query(`SELECT m.team_id AS "teamId", u.id AS "userId", u.name, u.email FROM help_team_members m JOIN users u ON u.id = m.user_id ORDER BY u.name`);
  return teams.map((t) => ({ ...t, members: members.filter((m) => m.teamId === t.id).map(({ teamId, ...rest }) => rest) }));
}

export async function createTeam({ name, description }) {
  try {
    const rows = await query(`INSERT INTO help_teams (name, description) VALUES ($1, $2) RETURNING id`, [name, description]);
    return (await listTeams()).find((t) => t.id === rows[0].id);
  } catch (err) {
    if (err.code === '23505') throw conflict('There is already a team with that name', { name: 'That team already exists' });
    throw err;
  }
}

export async function updateTeam(id, patch) {
  const current = (await listTeams()).find((t) => t.id === id);
  if (!current) throw notFound('Team not found');
  const next = { ...current, ...patch };
  try {
    await query(`UPDATE help_teams SET name = $2, description = $3, is_active = $4 WHERE id = $1`, [id, next.name, next.description, next.isActive]);
  } catch (err) {
    if (err.code === '23505') throw conflict('There is already a team with that name', { name: 'That team already exists' });
    throw err;
  }
  return (await listTeams()).find((t) => t.id === id);
}

export async function addTeamMember(teamId, email) {
  if (!(await query(`SELECT 1 FROM help_teams WHERE id = $1`, [teamId])).length) throw notFound('Team not found');
  const user = (await query(`SELECT id, role FROM users WHERE email = $1`, [email]))[0];
  if (!user || user.role !== 'participant') {
    throw unprocessable('Please fix the highlighted fields', { email: 'No student account uses that email. Responders sign up as students first.' });
  }
  await query(`INSERT INTO help_team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [teamId, user.id]);
  return (await listTeams()).find((t) => t.id === teamId);
}

export async function removeTeamMember(teamId, userId) {
  const rows = await query(`DELETE FROM help_team_members WHERE team_id = $1 AND user_id = $2 RETURNING user_id`, [teamId, userId]);
  if (!rows[0]) throw notFound('That person is not on the team');
  return (await listTeams()).find((t) => t.id === teamId);
}

/* -------------------------------------------------------------- settings */

export async function escalationSettings() {
  const row = (await query(`SELECT value FROM help_settings WHERE key = 'escalation'`))[0];
  const value = typeof row?.value === 'string' ? JSON.parse(row.value) : row?.value;
  return {
    ackMinutes: { ...DEFAULT_ESCALATION.ackMinutes, ...value?.ackMinutes },
    unresolvedMinutes: { ...DEFAULT_ESCALATION.unresolvedMinutes, ...value?.unresolvedMinutes },
  };
}

export async function saveEscalationSettings(value) {
  await query(
    `INSERT INTO help_settings (key, value) VALUES ('escalation', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [JSON.stringify(value)],
  );
  return escalationSettings();
}

/** True when an urgent/high request has waited longer than the admin's limit without being acknowledged. */
export function isOverdue(request, settings, now = new Date()) {
  const limit = settings.ackMinutes[request.priority];
  if (!limit || request.status !== 'reported') return false;
  return minutesBetween(now, request.createdAt) >= limit;
}

export { minutesBetween };
