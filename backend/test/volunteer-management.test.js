import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

const ops = await import('../src/models/volunteerOpsModel.js');
const { runVolunteerReminders } = await import('../src/services/volunteerNotifications.js');
const { localNow } = await import('../src/utils/eventStatus.js');

// Volunteer Management: departments, shifts, assignments, tasks, duty attendance, announcements,
// reassignment requests, analytics, the Command Center and admin controls.
let t;
let org;
let org2;
let admin;
let arun; let bala; let chitra; let dev; let eli; let fay;
let outsider;
let event;
let reg; let tech; let desk; // departments
const today = dayOffset(0);
const day = dayOffset(1);

const api = (method, url, token, json) => t.api(method, url, { token, json });
const E = () => `/api/events/${event.id}`;
const inbox = async (token) => (await api('GET', '/api/notifications?pageSize=50', token)).body.notifications;
const hasNotice = async (token, type) => (await inbox(token)).some((n) => n.type === type);
const duty = (token, body) => api('POST', `${E()}/volunteer-assignments`, token, body);
const assign = (user, department, extra = {}) => duty(org.token, { userId: user.user.id, departmentId: department.id, date: day, startTime: '09:00', endTime: '11:00', ...extra });
const task = (body) => api('POST', `${E()}/volunteer-tasks`, org.token, { date: today, startTime: '09:00', endTime: '10:00', title: 'Manage the desk', ...body });
const addVolunteer = async (person) => assert.equal((await api('POST', `${E()}/staff`, org.token, { email: person.user.email, role: 'volunteer' })).status, 201);

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com', { name: 'Olive Organizer' });
  org2 = await t.signUp('organizer', 'org2@x.com');
  admin = await t.signUp('participant', 'admin@x.com', { name: 'Admin User' });
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.user.id]);
  for (const [name, key] of [['Arun Kumar', 'arun'], ['Bala Raj', 'bala'], ['Chitra Devi', 'chitra'], ['Dev Anand', 'dev'], ['Eli Jose', 'eli'], ['Fay Noor', 'fay']]) {
    const person = await t.signUp('participant', `${key}@x.com`, { name });
    ({ arun, bala, chitra, dev, eli, fay }[key] = person);
    if (key === 'arun') arun = person; if (key === 'bala') bala = person; if (key === 'chitra') chitra = person;
    if (key === 'dev') dev = person; if (key === 'eli') eli = person; if (key === 'fay') fay = person;
  }
  outsider = await t.signUp('participant', 'out@x.com', { name: 'Not A Volunteer' });
  event = await t.createEvent(org.token, { name: 'Tech Fest 2026' });
  await query(`UPDATE events SET date = $2::date, end_date = $3::date, start_time = '00:00', end_time = '23:59' WHERE id = $1`, [event.id, today, dayOffset(2)]);
});
after(() => t.stop());

describe('applying and approval', () => {
  it('lets a student apply with the full form and become a volunteer once approved', async () => {
    const res = await api('POST', `/api/events/${event.id}/volunteers/apply`, arun.token, {
      message: 'I would love to help', phone: '+91 98765 43210', year: 3, skills: ['Python', 'Web Development', 'Communication'], interests: 'Tech events',
      availability: 'Full day', experience: 'Ran the registration desk last year', preferredDepartment: 'Technical Support',
    });
    assert.equal(res.status, 201);
    assert.equal((await api('POST', `/api/events/${event.id}/volunteers/apply`, arun.token, {})).status, 409, 'cannot apply twice');
    assert.equal((await api('POST', `/api/events/${event.id}/volunteers/apply`, bala.token, { skills: 'Python' })).status, 422);
    assert.equal((await api('POST', `/api/events/${event.id}/volunteers/apply`, org.token, {})).status, 403);

    const list = (await api('GET', `${E()}/volunteer-applications`, org.token)).body.applications;
    const mine = list.find((a) => a.name === 'Arun Kumar');
    assert.deepEqual([mine.preferredDepartment, mine.availability, mine.status], ['Technical Support', 'Full day', 'pending']);
    assert.deepEqual(mine.skills, ['Python', 'Web Development', 'Communication']);
    assert.equal((await api('PATCH', `${E()}/volunteer-applications/${mine.id}`, org.token, { status: 'approved' })).status, 200);
    assert.ok(await hasNotice(arun.token, 'volunteer_decision'));
    const profile = (await api('GET', '/api/volunteer/profile', arun.token)).body.profile;
    assert.match(profile.volunteerCode, /^VOL-\d{4}-\d{6}$/);
    assert.equal(profile.availability, 'Full day', 'the profile starts from the application');
  });

  it('keeps rejected and unapproved students out of assignments', async () => {
    await api('POST', `/api/events/${event.id}/volunteers/apply`, bala.token, { availability: 'Morning' });
    const app = (await api('GET', `${E()}/volunteer-applications`, org.token)).body.applications.find((a) => a.name === 'Bala Raj');
    assert.equal((await api('PATCH', `${E()}/volunteer-applications/${app.id}`, org.token, { status: 'declined' })).status, 200);
    reg = (await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'Registration', requiredCount: 2 })).body.department;
    const res = await assign(bala, reg);
    assert.equal(res.status, 422, 'a rejected applicant is not a volunteer');
    assert.equal((await assign(outsider, reg)).status, 422);
    for (const person of [bala, chitra, dev, eli, fay]) if (person !== bala) await addVolunteer(person);
    await api('POST', `/api/events/${event.id}/volunteers/apply`, bala.token, { availability: 'Morning' });
    const again = (await api('GET', `${E()}/volunteer-applications`, org.token)).body.applications.find((a) => a.name === 'Bala Raj');
    await api('PATCH', `${E()}/volunteer-applications/${again.id}`, org.token, { status: 'approved' });
  });
});

describe('departments', () => {
  it('creates departments with a required number, place, shift times and instructions', async () => {
    const made = await api('POST', `${E()}/volunteer-departments`, org.token, {
      name: 'Technical Support', description: 'Help with computers', requiredCount: 4, location: 'A Block - Lab 3', shiftStart: '09:00', shiftEnd: '16:00', instructions: 'Assist participants with technical issues.', priority: 'high',
    });
    assert.equal(made.status, 201);
    tech = made.body.department;
    assert.deepEqual([tech.requiredCount, tech.location, tech.shiftStart, tech.shiftEnd, tech.priority], [4, 'A Block - Lab 3', '09:00', '16:00', 'high']);
    desk = (await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'Help Desk', requiredCount: 6 })).body.department;
    assert.equal((await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'help desk' })).status, 409, 'names are unique per event, ignoring case');
  });

  it('validates the form', async () => {
    const bad = await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'x', requiredCount: -1, priority: 'asap' });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.name && bad.body.errors.requiredCount && bad.body.errors.priority);
    // Rules that compare two fields are checked once each field is valid on its own.
    const backwards = await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'Backwards', shiftStart: '11:00', shiftEnd: '09:00' });
    assert.equal(backwards.status, 422);
    assert.ok(backwards.body.errors.shiftEnd);
  });

  it('shows slots remaining and the admin templates', async () => {
    const res = (await api('GET', `${E()}/volunteer-departments`, org.token)).body;
    const registration = res.departments.find((d) => d.name === 'Registration');
    assert.deepEqual([registration.requiredCount, registration.assigned, registration.needed], [2, 0, 2]);
    assert.ok(res.templates.length >= 9 && res.templates.some((x) => x.name === 'Photography'));
  });

  it('is limited to the event organizer', async () => {
    assert.equal((await api('GET', `${E()}/volunteer-departments`, org2.token)).status, 403);
    assert.equal((await api('GET', `${E()}/volunteer-departments`, arun.token)).status, 403);
    assert.equal((await api('PUT', `/api/volunteer-departments/${reg.id}`, org2.token, { name: 'Hijacked' })).status, 403);
    assert.equal((await api('PUT', `/api/volunteer-departments/${reg.id}`, arun.token, { name: 'Hijacked' })).status, 403);
    assert.equal((await api('POST', `${E()}/volunteer-departments`, arun.token, { name: 'Sneaky' })).status, 403);
  });

  it('edits a department', async () => {
    const res = await api('PUT', `/api/volunteer-departments/${reg.id}`, org.token, { location: 'Main Entrance', instructions: 'Verify participant QR codes.' });
    assert.equal(res.body.department.location, 'Main Entrance');
    assert.equal((await api('PUT', `/api/volunteer-departments/${reg.id}`, org.token, {})).status, 422);
  });
});

describe('shifts', () => {
  it('creates shifts, in bulk for several departments, and shows available slots', async () => {
    const one = await api('POST', `${E()}/volunteer-shifts`, org.token, { departmentId: tech.id, name: 'Morning Shift', date: day, startTime: '08:00', endTime: '12:00', requiredCount: 2 });
    assert.equal(one.status, 201);
    const bulk = await api('POST', `${E()}/volunteer-shifts`, org.token, { departmentIds: [reg.id, desk.id], name: 'Afternoon Shift', date: day, startTime: '12:00', endTime: '16:00', requiredCount: 1 });
    assert.equal(bulk.body.shifts.length, 2);
    const list = (await api('GET', `${E()}/volunteer-shifts`, org.token)).body.shifts;
    const morning = list.find((s) => s.name === 'Morning Shift');
    assert.deepEqual([morning.requiredCount, morning.assigned, morning.available, morning.departmentName], [2, 0, 2, 'Technical Support']);
  });

  it('rejects bad times and days outside the event', async () => {
    assert.equal((await api('POST', `${E()}/volunteer-shifts`, org.token, { departmentId: tech.id, name: 'Bad', date: day, startTime: '12:00', endTime: '08:00' })).status, 422);
    assert.equal((await api('POST', `${E()}/volunteer-shifts`, org.token, { departmentId: tech.id, name: 'Far', date: dayOffset(30), startTime: '08:00', endTime: '12:00' })).status, 422);
    assert.equal((await api('POST', `${E()}/volunteer-shifts`, org2.token, { departmentId: tech.id, name: 'Nope', date: day, startTime: '08:00', endTime: '12:00' })).status, 403);
  });
});

describe('assigning volunteers', () => {
  let first;

  it('assigns a volunteer with a place, time and task, and notifies them', async () => {
    const res = await assign(arun, reg, { task: 'Verify participant registration and guide students.', startTime: '08:30', endTime: '11:30' });
    assert.equal(res.status, 201);
    first = res.body.assignment;
    assert.deepEqual([first.status, first.location, first.startTime, first.endTime, first.department.name], ['assigned', 'Main Entrance', '08:30', '11:30', 'Registration']);
    assert.ok(await hasNotice(arun.token, 'volunteer_assigned'));
  });

  it('prevents overlapping shifts for the same volunteer, but allows back-to-back ones', async () => {
    const clash = await assign(arun, desk, { startTime: '10:00', endTime: '12:00' });
    assert.equal(clash.status, 409);
    assert.match(clash.body.message, /already has a shift from 08:30 to 11:30/);
    assert.equal((await assign(arun, desk, { startTime: '11:30', endTime: '12:30' })).status, 201, 'touching shifts do not overlap');
    assert.equal((await assign(arun, desk, { startTime: '08:00', endTime: '08:31' })).status, 409);
  });

  it('shows how many slots remain and refuses to overfill unless asked', async () => {
    assert.equal((await assign(bala, reg, { startTime: '08:30', endTime: '11:30' })).status, 201);
    const third = await assign(chitra, reg, { startTime: '08:30', endTime: '11:30' });
    assert.equal(third.status, 409);
    assert.match(third.body.message, /needs 2 volunteers and already has 2/);
    const forced = await assign(chitra, reg, { startTime: '08:30', endTime: '11:30', allowOverflow: true });
    assert.equal(forced.status, 201, 'the organizer can go over on purpose');
    const card = (await api('GET', `${E()}/volunteer-departments`, org.token)).body.departments.find((d) => d.id === reg.id);
    assert.deepEqual([card.assigned, card.needed], [3, 0]);
    await api('DELETE', `/api/volunteer-assignments/${forced.body.assignment.id}`, org.token, {});
  });

  it('takes defaults from the shift and the department', async () => {
    const shifts = (await api('GET', `${E()}/volunteer-shifts`, org.token)).body.shifts;
    const morning = shifts.find((s) => s.name === 'Morning Shift');
    const res = await duty(org.token, { userId: dev.user.id, departmentId: tech.id, shiftId: morning.id });
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.assignment.startTime, res.body.assignment.endTime, res.body.assignment.location, res.body.assignment.shift.name], ['08:00', '12:00', 'A Block - Lab 3', 'Morning Shift']);
    const full = await duty(org.token, { userId: eli.user.id, departmentId: tech.id, shiftId: morning.id });
    assert.equal(full.status, 201, 'shift has two slots');
    const over = await duty(org.token, { userId: fay.user.id, departmentId: tech.id, shiftId: morning.id });
    assert.equal(over.status, 409);
    assert.match(over.body.message, /shift needs 2/);
    assert.equal((await duty(org.token, { userId: fay.user.id, departmentId: reg.id, shiftId: morning.id })).status, 422, 'a shift belongs to its own department');
    const missing = await duty(org.token, { userId: fay.user.id, departmentId: desk.id });
    assert.equal(missing.status, 422);
    assert.ok(missing.body.errors.date && missing.body.errors.startTime);
  });

  it('refuses non-volunteers, days outside the event and backwards times', async () => {
    assert.equal((await assign(outsider, desk)).status, 422);
    assert.equal((await assign(fay, desk, { date: dayOffset(30) })).status, 422);
    assert.equal((await assign(fay, desk, { startTime: '12:00', endTime: '10:00' })).status, 422);
  });

  it('is organizer-only and limited to the right event', async () => {
    assert.equal((await assign(fay, desk)).status, 201);
    const id = first.id;
    for (const [method, url, body] of [['PUT', `/api/volunteer-assignments/${id}`, { location: 'x' }], ['DELETE', `/api/volunteer-assignments/${id}`, {}]]) {
      assert.equal((await api(method, url, arun.token, body)).status, 403, `volunteer ${method}`);
      assert.equal((await api(method, url, org2.token, body)).status, 404, `other organizer ${method}`);
      assert.equal((await t.api(method, url)).status, 401);
    }
    assert.equal((await duty(arun.token, { userId: arun.user.id, departmentId: desk.id })).status, 403);
    assert.equal((await duty(org2.token, { userId: fay.user.id, departmentId: desk.id })).status, 403);
  });

  it('reassigns a volunteer: changes the duty, requires re-acceptance, and tells them', async () => {
    const res = await api('PUT', `/api/volunteer-assignments/${first.id}`, org.token, { location: 'Gate 2', startTime: '09:00', endTime: '11:30' });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.assignment.location, res.body.assignment.startTime, res.body.assignment.status], ['Gate 2', '09:00', 'assigned']);
    assert.ok((await inbox(arun.token)).some((n) => n.type === 'volunteer_assignment_changed'));
    const clash = await api('PUT', `/api/volunteer-assignments/${first.id}`, org.token, { departmentId: desk.id, startTime: '11:30', endTime: '12:30' });
    assert.equal(clash.status, 409, 'moving into another of the volunteer\'s own shifts is refused');
  });

  it('moves a duty to a different volunteer and tells both people', async () => {
    const mine = (await assign(eli, desk, { startTime: '14:00', endTime: '15:00' })).body.assignment;
    const res = await api('PUT', `/api/volunteer-assignments/${mine.id}`, org.token, { userId: fay.user.id, startTime: '14:30', endTime: '15:30' });
    assert.equal(res.body.assignment.volunteer.name, 'Fay Noor');
    assert.ok(await hasNotice(eli.token, 'volunteer_assignment_removed'));
    assert.ok((await inbox(fay.token)).some((n) => n.type === 'volunteer_assignment_changed'));
  });

  it('removes an assignment, keeps it in the audit trail and reopens the slot', async () => {
    const extra = (await assign(eli, desk, { startTime: '17:00', endTime: '18:00', allowOverflow: true })).body.assignment;
    assert.equal((await api('DELETE', `/api/volunteer-assignments/${extra.id}`, org.token, { reason: 'Plans changed' })).status, 204);
    assert.ok(await hasNotice(eli.token, 'volunteer_assignment_removed'));
    assert.equal((await api('DELETE', `/api/volunteer-assignments/${extra.id}`, org.token, {})).status, 409, 'already removed');
    assert.equal((await api('PUT', `/api/volunteer-assignments/${extra.id}`, org.token, { location: 'x' })).status, 409, 'and no longer editable');
    const log = (await api('GET', `${E()}/volunteer-audit`, org.token)).body.log;
    assert.ok(log.some((l) => l.action === 'assignment_removed' && /Plans changed/.test(l.message)));
    assert.ok(log.some((l) => l.action === 'assignment_created'));
  });
});

describe('the volunteer list', () => {
  it('searches by name, email or volunteer ID and filters by department, status and date', async () => {
    const all = (await api('GET', `${E()}/volunteers`, org.token)).body;
    assert.equal(all.total, 6);
    const names = (qs) => api('GET', `${E()}/volunteers${qs}`, org.token).then((r) => r.body.volunteers.map((v) => v.name));
    assert.deepEqual(await names('?search=arun'), ['Arun Kumar']);
    assert.deepEqual(await names('?search=bala@x.com'), ['Bala Raj']);
    const code = all.volunteers.find((v) => v.name === 'Chitra Devi').volunteerCode;
    assert.deepEqual(await names(`?search=${code}`), ['Chitra Devi']);
    assert.ok((await names(`?departmentId=${reg.id}`)).includes('Arun Kumar'));
    assert.ok(!(await names(`?departmentId=${reg.id}`)).includes('Dev Anand'));
    assert.ok((await names('?status=assigned')).includes('Arun Kumar'), 'holding an unstarted duty means assigned');
    assert.ok((await names(`?date=${day}`)).includes('Arun Kumar'));
    assert.deepEqual(await names(`?date=${dayOffset(2)}&status=assigned`), []);
    const row = all.volunteers.find((v) => v.name === 'Arun Kumar');
    assert.deepEqual([row.department, row.event, row.attendance], ['Registration', 'Tech Fest 2026', 'not_checked_in']);
    assert.equal((await api('GET', `${E()}/volunteers`, org2.token)).status, 403);
  });

  it('shows the volunteer\'s profile, assignments, hours, tasks and timeline', async () => {
    const res = await api('GET', `${E()}/volunteers/${arun.user.id}`, org.token);
    assert.equal(res.status, 200);
    const v = res.body;
    assert.deepEqual([v.volunteer.name, v.volunteer.email, v.volunteer.isActive], ['Arun Kumar', 'arun@x.com', true]);
    assert.ok(v.volunteer.volunteerCode && v.application.preferredDepartment === 'Technical Support');
    assert.ok(v.assignments.length >= 2 && v.currentAssignment);
    assert.ok(v.timeline.some((x) => /Assigned to/.test(x.message)));
    assert.equal((await api('GET', `${E()}/volunteers/${outsider.user.id}`, org.token)).status, 404);
    assert.equal((await api('GET', `${E()}/volunteers/${arun.user.id}`, bala.token)).status, 403, 'a volunteer cannot read another volunteer');
  });
});

describe('the volunteer\'s own duty', () => {
  let mine;

  before(async () => {
    // Chitra gets a full-day duty so check-in is open whenever the tests run.
    mine = (await assign(chitra, tech, { date: today, startTime: '00:00', endTime: '23:59', task: 'Floating technical support', location: 'Lab 3' })).body.assignment;
  });

  it('shows only their own dashboard, with the organizer\'s contact', async () => {
    const dash = (await api('GET', '/api/volunteer/dashboard', chitra.token)).body;
    assert.equal(dash.volunteer.name, 'Chitra Devi');
    assert.equal(dash.current.id, mine.id);
    assert.equal(dash.current.department.name, 'Technical Support');
    assert.equal(dash.current.organizer.name, event.organizerName);
    assert.ok(dash.today.every((d) => d.id !== undefined));
    const text = JSON.stringify(dash);
    assert.ok(!text.includes('Arun') && !text.includes('arun@x.com'), 'no other volunteer\'s details');
    assert.equal((await api('GET', '/api/volunteer/dashboard', org.token)).status, 403, 'organizers use their own pages');
    assert.equal((await t.api('GET', '/api/volunteer/dashboard')).status, 401);
  });

  it('must accept the duty before checking in', async () => {
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/check-in`, chitra.token)).status, 409);
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/accept`, bala.token)).status, 404, 'not theirs');
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/accept`, org.token)).status, 403);
    const res = await api('POST', `/api/volunteer-assignments/${mine.id}/accept`, chitra.token);
    assert.equal(res.body.assignment.status, 'accepted');
    assert.ok(await hasNotice(org.token, 'volunteer_accepted'));
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/accept`, chitra.token)).status, 409);
  });

  it('checks in, takes a break, and checks out with the time worked', async () => {
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/check-out`, chitra.token)).status, 409, 'cannot check out before checking in');
    const inRes = await api('POST', `/api/volunteer-assignments/${mine.id}/check-in`, chitra.token);
    assert.equal(inRes.status, 200);
    assert.deepEqual([inRes.body.assignment.attendance, inRes.body.assignment.liveStatus], ['checked_in', 'checked_in']);
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/check-in`, chitra.token)).status, 409, 'only once');
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/break`, chitra.token, { onBreak: true })).body.assignment.liveStatus, 'on_break');
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/break`, chitra.token, { onBreak: false })).body.assignment.onBreak, false);
    assert.equal((await api('PUT', `/api/volunteer-assignments/${mine.id}`, org.token, { location: 'Elsewhere' })).status, 409, 'no changes once they are on duty');
    assert.equal((await api('DELETE', `/api/volunteer-assignments/${mine.id}`, org.token, {})).status, 409, 'and no removal while on duty');
  });

  it('runs tasks: organizer creates, volunteer accepts, starts and completes', async () => {
    assert.equal((await task({ userId: chitra.user.id, departmentId: desk.id })).status, 422, 'they have no duty in that department');
    assert.equal((await task({ userId: chitra.user.id, departmentId: tech.id, priority: 'asap' })).status, 422);
    assert.equal((await api('POST', `${E()}/volunteer-tasks`, chitra.token, { userId: chitra.user.id, departmentId: tech.id, title: 'Self task', date: today, startTime: '09:00', endTime: '10:00' })).status, 403);
    const made = await task({ userId: chitra.user.id, departmentId: tech.id, title: 'Fix the projector', priority: 'urgent', location: 'Seminar Hall 2', instructions: '1. Check the cable.\n2. Replace the lamp.' });
    assert.equal(made.status, 201);
    const id = made.body.task.id;
    assert.ok((await inbox(chitra.token)).some((n) => n.type === 'volunteer_task' && /Fix the projector/.test(n.message)));

    const mineTasks = (await api('GET', '/api/volunteer/tasks', chitra.token)).body;
    assert.equal(mineTasks.today[0].title, 'Fix the projector');
    assert.equal(mineTasks.today[0].capabilities.canAccept, true);
    assert.equal((await api('POST', `/api/volunteer-tasks/${id}/start`, chitra.token)).status, 409, 'accept first');
    assert.equal((await api('POST', `/api/volunteer-tasks/${id}/accept`, bala.token)).status, 404, 'not theirs');
    assert.equal((await api('POST', `/api/volunteer-tasks/${id}/accept`, chitra.token)).body.task.status, 'accepted');
    const started = await api('POST', `/api/volunteer-tasks/${id}/start`, chitra.token);
    assert.equal(started.body.task.status, 'in_progress');
    assert.equal((await api('GET', `${E()}/volunteer-attendance`, org.token)).body.rows.find((r) => r.id === mine.id).liveStatus, 'active', 'on duty with a task running');
    assert.equal((await api('POST', `/api/volunteer-tasks/${id}/complete`, chitra.token)).body.task.status, 'completed');
    assert.ok(await hasNotice(org.token, 'volunteer_task_done'));
    assert.equal((await api('POST', `/api/volunteer-tasks/${id}/complete`, chitra.token)).status, 409);

    // A completed task is locked.
    assert.equal((await api('PUT', `/api/volunteer-tasks/${id}`, chitra.token, { title: 'Mine now' })).status, 403, 'volunteers cannot change requirements');
    assert.equal((await api('PUT', `/api/volunteer-tasks/${id}`, org.token, { title: 'Fix the projector lamp' })).status, 409);
    assert.equal((await api('PUT', `/api/volunteer-tasks/${id}`, org.token, { title: 'Fix the projector lamp', allowCompleted: true })).body.task.title, 'Fix the projector lamp');
    assert.equal((await api('PUT', `/api/volunteer-tasks/${id}`, org2.token, { title: 'Hijacked task' })).status, 404);
  });

  it('only lets a volunteer who accepted their duty start tasks', async () => {
    const pending = await task({ userId: bala.user.id, departmentId: reg.id, title: 'Welcome guests' });
    assert.equal(pending.status, 201);
    const refused = await api('POST', `/api/volunteer-tasks/${pending.body.task.id}/accept`, bala.token);
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /Accept your volunteer assignment/);
  });

  it('checks out and keeps the duration, then lists it as completed history', async () => {
    const out = await api('POST', `/api/volunteer-assignments/${mine.id}/check-out`, chitra.token);
    assert.equal(out.body.assignment.attendance, 'checked_out');
    assert.equal(out.body.assignment.status, 'completed');
    assert.ok(out.body.assignment.minutes >= 0);
    assert.equal((await api('POST', `/api/volunteer-assignments/${mine.id}/check-out`, chitra.token)).status, 409);
    const history = (await api('GET', '/api/volunteer/history', chitra.token)).body;
    assert.equal(history.duties.length, 1);
    assert.equal(history.tasks.length, 1);
    assert.equal(history.summary.completedDuties, 1);
  });

  it('shows the volunteer only their own schedule', async () => {
    const schedule = (await api('GET', '/api/volunteer/schedule', arun.token)).body.assignments;
    assert.ok(schedule.length >= 2 && schedule.every((s) => s.eventName === 'Tech Fest 2026'));
    assert.ok(!JSON.stringify(schedule).includes('Bala'));
  });
});

describe('check-in rules', () => {
  const base = { id: 1, date: '2026-05-01', startTime: '09:00', endTime: '12:00' };
  const settings = { earlyCheckInMinutes: 30, lateGraceMinutes: 10 };

  it('opens before the shift, flags lateness after the grace period, and closes when it ends', () => {
    const at = (time, date = base.date) => ops.checkInWindow(base, settings, { date, time });
    assert.deepEqual(at('08:29'), { ok: false, reason: 'Check-in opens at 08:30.' });
    assert.deepEqual(at('08:30'), { ok: true, late: false });
    assert.deepEqual(at('09:10'), { ok: true, late: false });
    assert.deepEqual(at('09:11'), { ok: true, late: true });
    assert.equal(at('12:00').ok, false);
    assert.match(at('12:00').reason, /shift has ended/);
    assert.match(at('08:45', '2026-04-30').reason, /on the day/);
    assert.match(at('08:45', '2026-05-02').reason, /has passed/);
  });

  it('refuses to check in outside the shift through the API, but lets the organizer override', async () => {
    const future = (await duty(org.token, { userId: dev.user.id, departmentId: desk.id, date: today, startTime: '23:50', endTime: '23:59' }));
    // Only meaningful when the test is not running in the last minutes of the day.
    const nowMins = Number(localNow().time.slice(0, 2)) * 60 + Number(localNow().time.slice(3, 5));
    if (future.status === 201 && nowMins < 23 * 60 + 15) {
      await api('POST', `/api/volunteer-assignments/${future.body.assignment.id}/accept`, dev.token);
      const early = await api('POST', `/api/volunteer-assignments/${future.body.assignment.id}/check-in`, dev.token);
      assert.equal(early.status, 409);
      assert.match(early.body.message, /Check-in opens at 23:20/);
      const manual = await api('POST', `/api/volunteer-assignments/${future.body.assignment.id}/check-in`, org.token);
      assert.equal(manual.status, 200, 'the organizer can check someone in by hand');
      assert.equal((await api('POST', `/api/volunteer-assignments/${future.body.assignment.id}/check-out`, org.token)).status, 200);
    }
  });

  it('refuses a duty on another day', async () => {
    const tomorrow = await query(`UPDATE events SET end_date = $2::date WHERE id = $1`, [event.id, dayOffset(2)]);
    void tomorrow;
    const res = await duty(org.token, { userId: eli.user.id, departmentId: desk.id, date: dayOffset(2), startTime: '06:00', endTime: '07:00' });
    assert.equal(res.status, 201);
    await api('POST', `/api/volunteer-assignments/${res.body.assignment.id}/accept`, eli.token);
    const early = await api('POST', `/api/volunteer-assignments/${res.body.assignment.id}/check-in`, eli.token);
    assert.equal(early.status, 409);
    assert.match(early.body.message, /on the day/);
  });
});

describe('reassignment requests', () => {
  let request;

  it('lets a volunteer ask to be reassigned, and tells the organizer', async () => {
    const bad = await api('POST', `/api/volunteer-assignments/${(await myAssignment(bala, reg)).id}/reassignment`, bala.token, { reason: 'x' });
    assert.equal(bad.status, 422);
    const a = await myAssignment(bala, reg);
    const res = await api('POST', `/api/volunteer-assignments/${a.id}/reassignment`, bala.token, { reason: 'I have a class conflict during this shift.' });
    assert.equal(res.status, 201);
    request = res.body.request;
    assert.equal(request.status, 'requested');
    assert.ok(await hasNotice(org.token, 'volunteer_reassignment_request'));
    assert.equal((await api('POST', `/api/volunteer-assignments/${a.id}/reassignment`, bala.token, { reason: 'Again please' })).status, 409, 'one open request at a time');
    assert.equal((await api('POST', `/api/volunteer-assignments/${a.id}/reassignment`, arun.token, { reason: 'Not mine at all' })).status, 404);
    const flagged = (await api('GET', `${E()}/volunteer-assignments`, org.token)).body.assignments.find((x) => x.id === a.id);
    assert.equal(flagged.reassignmentRequested, true);
  });

  it('is decided only by the event organizer', async () => {
    assert.equal((await api('PATCH', `/api/volunteer-reassignments/${request.id}`, bala.token, { status: 'approved' })).status, 403);
    assert.equal((await api('PATCH', `/api/volunteer-reassignments/${request.id}`, org2.token, { status: 'approved' })).status, 403);
    assert.equal((await api('PATCH', `/api/volunteer-reassignments/${request.id}`, org.token, { status: 'maybe' })).status, 422);
    const list = (await api('GET', `${E()}/volunteer-reassignments`, org.token)).body.requests;
    assert.equal(list[0].volunteerName, 'Bala Raj');
  });

  it('approving releases the volunteer, reopens the slot and cancels unstarted tasks', async () => {
    const res = await api('PATCH', `/api/volunteer-reassignments/${request.id}`, org.token, { status: 'approved', note: 'Thanks for telling us' });
    assert.equal(res.body.request.status, 'approved');
    assert.ok((await inbox(bala.token)).some((n) => n.type === 'volunteer_reassignment' && /released/.test(n.message)));
    assert.equal((await myAssignment(bala, reg)), undefined, 'the duty is gone');
    const tasks = (await api('GET', `${E()}/volunteer-tasks?userId=${bala.user.id}`, org.token)).body.tasks;
    assert.ok(tasks.every((x) => x.status === 'cancelled'));
    assert.equal((await api('PATCH', `/api/volunteer-reassignments/${request.id}`, org.token, { status: 'rejected' })).status, 409, 'decided once');
    const other = (await assign(bala, desk, { startTime: '13:00', endTime: '14:00' }));
    assert.equal(other.status, 201, 'the organizer can assign them somewhere else');
  });

  it('can be rejected, which keeps the duty', async () => {
    const a = (await assign(eli, tech, { startTime: '15:00', endTime: '16:00', allowOverflow: true })).body.assignment;
    const req = (await api('POST', `/api/volunteer-assignments/${a.id}/reassignment`, eli.token, { reason: 'Prefer something else' })).body.request;
    const res = await api('PATCH', `/api/volunteer-reassignments/${req.id}`, org.token, { status: 'rejected', note: 'We need you here' });
    assert.equal(res.body.request.status, 'rejected');
    assert.ok((await inbox(eli.token)).some((n) => n.type === 'volunteer_reassignment' && /not approved/i.test(n.title)));
    assert.ok((await api('GET', '/api/volunteer/schedule', eli.token)).body.assignments.some((x) => x.id === a.id));
  });
});

async function myAssignment(person, department) {
  return (await api('GET', '/api/volunteer/schedule', person.token)).body.assignments.find((x) => x.department.id === department.id && ['assigned', 'accepted'].includes(x.status));
}

describe('announcements', () => {
  it('sends to everyone, a department, a shift or one volunteer, and volunteers are notified', async () => {
    const all = await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'Welcome team', message: 'Please read the briefing.', scope: 'all' });
    assert.equal(all.status, 201);
    assert.equal(all.body.announcement.recipients, 6, 'every active volunteer');
    for (const person of [arun, bala, chitra, dev, eli, fay]) assert.ok(await hasNotice(person.token, 'volunteer_announcement'));

    const dept = await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'Technical Support', message: 'Report to Lab 3 by 8:45 AM.', scope: 'department', departmentId: tech.id });
    assert.equal(dept.status, 201);
    const techPeople = (await api('GET', `${E()}/volunteer-assignments`, org.token)).body.assignments.filter((a) => a.department.id === tech.id).map((a) => a.volunteer.userId);
    assert.equal(dept.body.announcement.recipients, new Set(techPeople).size);
    const shift = (await api('GET', `${E()}/volunteer-shifts`, org.token)).body.shifts.find((s) => s.name === 'Morning Shift');
    assert.equal((await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'Morning crew', message: 'Meet at 7:45.', scope: 'shift', shiftId: shift.id })).status, 201);
    const one = await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'Just you', message: 'Please see me.', scope: 'volunteer', userId: arun.user.id });
    assert.equal(one.body.announcement.recipients, 1);
  });

  it('shows each volunteer only what was addressed to them', async () => {
    const arunSees = (await api('GET', '/api/volunteer/announcements', arun.token)).body.announcements.map((a) => a.title);
    assert.ok(arunSees.includes('Welcome team') && arunSees.includes('Just you'));
    assert.ok(!arunSees.includes('Technical Support'), 'Arun is not in Technical Support');
    const chitraSees = (await api('GET', '/api/volunteer/announcements', chitra.token)).body.announcements.map((a) => a.title);
    assert.ok(chitraSees.includes('Technical Support') && !chitraSees.includes('Just you'));
    assert.equal((await api('GET', '/api/volunteer/announcements', outsider.token)).body.announcements.length, 0);
    assert.equal((await api('GET', `${E()}/volunteer-announcements`, org.token)).body.announcements.length, 4);
  });

  it('validates and is organizer-only', async () => {
    assert.equal((await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'x', message: '', scope: 'department' })).status, 422);
    const empty = await api('POST', `${E()}/volunteer-announcements`, org.token, { title: 'Nobody', message: 'Hello', scope: 'department', departmentId: (await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'Photography' })).body.department.id });
    assert.equal(empty.status, 422, 'a department with nobody in it');
    assert.equal((await api('POST', `${E()}/volunteer-announcements`, arun.token, { title: 'Spam', message: 'Hi', scope: 'all' })).status, 403);
    assert.equal((await api('POST', `${E()}/volunteer-announcements`, org2.token, { title: 'Spam', message: 'Hi', scope: 'all' })).status, 403);
  });
});

describe('shift reminders', () => {
  it('reminds a volunteer once, shortly before their shift starts', async () => {
    const now = localNow();
    const mins = Number(now.time.slice(0, 2)) * 60 + Number(now.time.slice(3, 5));
    if (mins > 22 * 60) return; // too close to midnight to place a shift 20 minutes ahead
    const start = ops.clock(mins + 20);
    const res = await duty(org.token, { userId: dev.user.id, departmentId: desk.id, date: today, startTime: start, endTime: ops.clock(mins + 80) });
    assert.equal(res.status, 201);
    assert.ok((await runVolunteerReminders()) >= 1);
    assert.ok((await inbox(dev.token)).some((n) => n.type === 'volunteer_shift_reminder'));
    assert.equal((await runVolunteerReminders()), 0, 'only once per duty');
  });
});

describe('overview, attendance and analytics', () => {
  it('summarises the team and each department', async () => {
    const o = (await api('GET', `${E()}/volunteer-overview`, org.token)).body;
    assert.equal(o.totals.total, 6);
    assert.equal(o.totals.assigned + o.totals.unassigned, o.totals.total);
    assert.ok(o.totals.checkedIn >= 1 && o.totals.tasksCompleted >= 1);
    const registration = o.departments.find((d) => d.name === 'Registration');
    assert.deepEqual([registration.requiredCount, registration.status === 'complete' || registration.status === 'needed'], [2, true]);
    assert.ok(o.departments.every((d) => ['complete', 'needed', 'over'].includes(d.status)));
    assert.equal((await api('GET', `${E()}/volunteer-overview`, org2.token)).status, 403);
    assert.equal((await api('GET', `${E()}/volunteer-overview`, arun.token)).status, 403);
  });

  it('counts attendance for a day: checked in, late, absent and not checked in', async () => {
    const day = (await api('GET', `${E()}/volunteer-attendance?date=${today}`, org.token)).body;
    assert.equal(day.date, today);
    const s = day.summary;
    assert.ok(s.total >= 1 && s.checkedIn >= 1);
    assert.ok(s.late <= s.checkedIn, 'late people are a subset of those who checked in');
    const checkedOut = day.rows.find((r) => r.volunteer.name === 'Chitra Devi');
    assert.deepEqual([checkedOut.attendance, checkedOut.status], ['checked_out', 'completed']);
    assert.equal((await api('GET', `${E()}/volunteer-attendance?date=nope`, org.token)).status, 422);
  });

  it('reports departments, tasks, hours and attendance', async () => {
    const a = (await api('GET', `${E()}/volunteer-analytics`, org.token)).body;
    assert.ok(a.totals.totalVolunteers === 6 && a.totals.tasksCompleted >= 1);
    assert.ok(a.totals.averageAttendance >= 0 && a.totals.averageHours >= 0);
    assert.ok(a.departmentDistribution.some((d) => d.label === 'Registration'));
    assert.ok(a.tasksByDepartment.some((d) => d.label === 'Technical Support' && d.completed >= 1));
    assert.ok(a.volunteerHours.some((v) => v.label === 'Chitra Devi'));
    assert.ok(a.departmentWorkload.length > 0 && Array.isArray(a.attendanceByHour));
    assert.equal((await api('GET', `${E()}/volunteer-analytics`, org2.token)).status, 403);
  });
});

describe('the event command centre', () => {
  it('shows volunteer counts and warns about shortages, no-shows and overdue tasks', async () => {
    const hole = (await api('POST', `${E()}/volunteer-departments`, org.token, { name: 'Stage Management', requiredCount: 3 })).body.department;
    await assign(eli, hole, { startTime: '19:00', endTime: '20:00' });
    const cc = (await api('GET', `${E()}/control-center`, org.token)).body;
    assert.ok(cc.volunteers.total === 6 && cc.volunteers.checkedIn >= 1);
    assert.ok(cc.volunteers.alerts.some((a) => /Stage Management is short by 2 volunteers/.test(a.message)));
    assert.ok('active' in cc.volunteers && 'pendingTasks' in cc.volunteers && 'urgentTasks' in cc.volunteers && 'unassigned' in cc.volunteers);
    await query(`UPDATE volunteer_tasks SET end_time = '00:01', start_time = '00:00', status = 'accepted' WHERE event_id = $1 AND title = 'Welcome guests'`, [event.id]);
    // The task belonged to a released volunteer, so it stays cancelled; make a fresh overdue one.
    const overdue = (await task({ userId: eli.user.id, departmentId: hole.id, title: 'Set up the stage', startTime: '00:00', endTime: '00:01', priority: 'urgent' }));
    if (overdue.status === 201 && Number(localNow().time.slice(0, 2)) * 60 + Number(localNow().time.slice(3, 5)) > 1) {
      const again = (await api('GET', `${E()}/control-center`, org.token)).body.volunteers;
      assert.ok(again.overdueTasks >= 1 && again.urgentTasks >= 1);
      assert.ok(again.alerts.some((a) => /Stage Management task is overdue/.test(a.message)));
    }
  });
});

describe('deactivating and removing volunteers', () => {
  it('stops a deactivated volunteer receiving assignments and frees what they had not started', async () => {
    const duties = await assign(fay, tech, { startTime: '20:00', endTime: '21:00', allowOverflow: true });
    assert.equal(duties.status, 201);
    const off = await api('PUT', `${E()}/volunteers/${fay.user.id}`, org.token, { isActive: false, notes: 'Left the college' });
    assert.equal(off.status, 200);
    assert.equal((await myAssignment(fay, tech)), undefined, 'unstarted duties are released');
    const refused = await assign(fay, desk, { startTime: '21:00', endTime: '22:00' });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /deactivated/);
    assert.equal((await api('GET', `${E()}/volunteers?status=inactive`, org.token)).body.volunteers[0].name, 'Fay Noor');
    assert.equal((await api('POST', `/api/volunteer-assignments/${duties.body.assignment.id}/accept`, fay.token)).status, 403, 'a deactivated volunteer has no access to the event');
    assert.equal((await api('PUT', `${E()}/volunteers/${fay.user.id}`, org.token, { isActive: true })).status, 200);
    assert.equal((await assign(fay, desk, { startTime: '21:00', endTime: '22:00' })).status, 201, 'reactivated');
    assert.equal((await api('PUT', `${E()}/volunteers/${fay.user.id}`, org2.token, { isActive: false })).status, 403);
    assert.equal((await api('PUT', `${E()}/volunteers/${fay.user.id}`, arun.token, { isActive: false })).status, 403);
  });

  it('frees duties when the organizer removes someone from the event team', async () => {
    const staff = (await api('GET', `${E()}/staff`, org.token)).body.staff.find((s) => s.userId === eli.user.id);
    assert.equal((await api('DELETE', `${E()}/staff/${staff.id}`, org.token)).status, 204);
    assert.equal((await api('GET', '/api/volunteer/schedule', eli.token)).body.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).length, 0);
  });
});

describe('administration', () => {
  it('shows platform-wide analytics, activity and the audit log, to admins only', async () => {
    const a = (await api('GET', '/api/admin/volunteer-analytics', admin.token)).body;
    assert.ok(a.totals.totalVolunteers >= 5 && a.byEvent.length >= 1);
    const act = (await api('GET', '/api/admin/volunteer-activity', admin.token)).body;
    assert.ok(act.assignments.length >= 5 && act.log.length >= 5);
    assert.ok(!JSON.stringify(act).includes('@x.com'), 'no email addresses in the activity view');
    assert.ok((await api('GET', '/api/admin/volunteer-audit', admin.token)).body.log.some((l) => l.action === 'assignment_created'));
    assert.equal((await api('GET', `/api/admin/volunteer-activity?eventId=${event.id}`, admin.token)).status, 200);
    for (const url of ['/api/admin/volunteer-analytics', '/api/admin/volunteer-activity', '/api/admin/volunteer-audit', '/api/admin/volunteers', '/api/admin/volunteer-categories', '/api/admin/volunteer-settings']) {
      for (const person of [arun, org]) assert.equal((await api('GET', url, person.token)).status, 403, url);
      assert.equal((await t.api('GET', url)).status, 401);
    }
  });

  it('manages department categories', async () => {
    const made = await api('POST', '/api/admin/volunteer-categories', admin.token, { name: 'First Aid Support', description: 'Help the medical team', instructions: 'Stay near the medical room.' });
    assert.equal(made.status, 201);
    assert.equal((await api('POST', '/api/admin/volunteer-categories', admin.token, { name: 'Photography' })).status, 409);
    const off = await api('PUT', `/api/admin/volunteer-categories/${made.body.category.id}`, admin.token, { isActive: false });
    assert.equal(off.body.category.isActive, false);
    const templates = (await api('GET', `${E()}/volunteer-departments`, org.token)).body.templates.map((x) => x.name);
    assert.ok(!templates.includes('First Aid Support'), 'a switched-off template is not offered');
    assert.equal((await api('PUT', '/api/admin/volunteer-categories/99999', admin.token, { name: 'Nope' })).status, 404);
    assert.equal((await api('POST', '/api/admin/volunteer-categories', org.token, { name: 'Sneaky' })).status, 403);
  });

  it('sets the check-in grace period', async () => {
    const before = (await api('GET', '/api/admin/volunteer-settings', admin.token)).body.settings;
    assert.deepEqual([before.earlyCheckInMinutes, before.lateGraceMinutes], [30, 10]);
    const saved = await api('PUT', '/api/admin/volunteer-settings', admin.token, { earlyCheckInMinutes: 45, lateGraceMinutes: 5, shiftReminderMinutes: 20 });
    assert.deepEqual([saved.body.settings.earlyCheckInMinutes, saved.body.settings.lateGraceMinutes], [45, 5]);
    assert.equal((await api('PUT', '/api/admin/volunteer-settings', admin.token, { earlyCheckInMinutes: -1, lateGraceMinutes: 5, shiftReminderMinutes: 20 })).status, 422);
    await api('PUT', '/api/admin/volunteer-settings', admin.token, { earlyCheckInMinutes: 30, lateGraceMinutes: 10, shiftReminderMinutes: 30 });
  });

  it('suspends a volunteer everywhere: duties are released, new ones and applications are refused', async () => {
    const list = (await api('GET', '/api/admin/volunteers?search=dev@x.com', admin.token)).body.volunteers;
    assert.equal(list[0].name, 'Dev Anand');
    const res = await api('PUT', `/api/admin/volunteers/${dev.user.id}`, admin.token, { status: 'suspended' });
    assert.equal(res.status, 200);
    assert.equal((await myAssignment(dev, tech)), undefined);
    const refused = await assign(dev, desk, { startTime: '16:00', endTime: '17:00' });
    assert.equal(refused.status, 409);
    assert.match(refused.body.message, /suspended/);
    const other = await t.createEvent(org.token, { name: 'Another Fest' });
    assert.equal((await api('POST', `/api/events/${other.id}/volunteers/apply`, dev.token, {})).status, 409);
    assert.equal((await api('PUT', `/api/admin/volunteers/${dev.user.id}`, admin.token, { status: 'active' })).status, 200);
    assert.equal((await assign(dev, desk, { startTime: '16:00', endTime: '17:00' })).status, 201, 'restored');
    assert.equal((await api('PUT', `/api/admin/volunteers/${dev.user.id}`, org.token, { status: 'suspended' })).status, 403);
    assert.equal((await api('PUT', '/api/admin/volunteers/99999', admin.token, { status: 'suspended' })).status, 404);
  });
});

describe('security', () => {
  it('keeps volunteers out of organizer pages and other volunteers\' data', async () => {
    const urls = [
      ['GET', `${E()}/volunteer-overview`], ['GET', `${E()}/volunteers`], ['GET', `${E()}/volunteer-assignments`], ['GET', `${E()}/volunteer-tasks`],
      ['GET', `${E()}/volunteer-shifts`], ['GET', `${E()}/volunteer-attendance`], ['GET', `${E()}/volunteer-announcements`], ['GET', `${E()}/volunteer-reassignments`],
      ['GET', `${E()}/volunteer-analytics`], ['GET', `${E()}/volunteer-audit`],
    ];
    for (const [method, url] of urls) {
      assert.equal((await api(method, url, arun.token)).status, 403, `volunteer ${url}`);
      assert.equal((await api(method, url, org2.token)).status, 403, `other organizer ${url}`);
      assert.equal((await t.api(method, url)).status, 401, `anonymous ${url}`);
    }
    assert.equal((await api('GET', '/api/events/99999/volunteer-overview', org.token)).status, 404);
  });

  it('refuses a volunteer acting on another volunteer\'s assignment or task', async () => {
    const theirs = (await api('GET', `${E()}/volunteer-assignments`, org.token)).body.assignments.find((a) => a.volunteer.name === 'Arun Kumar' && a.status === 'assigned');
    for (const action of ['accept', 'check-in', 'check-out']) assert.equal((await api('POST', `/api/volunteer-assignments/${theirs.id}/${action}`, bala.token)).status, 404, action);
    assert.equal((await api('POST', `/api/volunteer-assignments/${theirs.id}/break`, bala.token, { onBreak: true })).status, 404);
    assert.equal((await api('POST', '/api/volunteer-assignments/99999/accept', bala.token)).status, 404);
    assert.equal((await api('POST', '/api/volunteer-tasks/99999/accept', bala.token)).status, 404);
  });

  it('refuses organizers who do not own the event, even with the right IDs', async () => {
    const theirs = (await api('GET', `${E()}/volunteer-assignments`, org.token)).body.assignments[0];
    assert.equal((await api('POST', `/api/volunteer-assignments/${theirs.id}/check-in`, org2.token)).status, 404);
    assert.equal((await api('PUT', `/api/volunteer-assignments/${theirs.id}`, org2.token, { location: 'x' })).status, 404);
    assert.equal((await api('DELETE', `/api/volunteer-shifts/1`, org2.token)).status, 403);
  });

  it('validates what it is sent', async () => {
    const empty = await duty(org.token, {});
    assert.equal(empty.status, 422);
    assert.ok(empty.body.errors.userId && empty.body.errors.departmentId);
    assert.equal((await api('POST', `${E()}/volunteer-tasks`, org.token, { title: '' })).status, 422);
  });
});
