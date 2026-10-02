import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

const { runReminders } = await import('../src/services/reminders.js');

// Phase 4: multi-day events, schedule, notifications, announcements, reminders.
let t;
let org;
let org2;
let alice;
let bob;
let outsider;
let event;

const item = (overrides = {}) => ({
  title: 'Opening keynote',
  description: 'Kick-off',
  date: dayOffset(10),
  startTime: '09:30',
  endTime: '10:30',
  venue: 'Hall A',
  speaker: 'Dr. Rao',
  sessionType: 'talk',
  ...overrides,
});
const addItem = (token, body, eventId = event.id) => t.api('POST', `/api/events/${eventId}/schedule`, { token, json: body });
const inbox = async (token, qs = '') => (await t.api('GET', `/api/notifications${qs}`, { token })).body;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  alice = await t.signUp('participant', 'alice@x.com', { name: 'Alice Kumar' });
  bob = await t.signUp('participant', 'bob@x.com', { name: 'Bob Singh' });
  outsider = await t.signUp('participant', 'out@x.com', { name: 'Outsider' });
  event = await t.createEvent(org.token, { name: 'Schedule Fest', requiresApproval: 'true' });
});
after(() => t.stop());

describe('multi-day events', () => {
  it('accepts an end date, validates it, and reports it in the event', async () => {
    const created = await t.createEvent(org.token, {
      name: '24h Hack', date: dayOffset(12), endDate: dayOffset(13), startTime: '09:00', endTime: '09:00',
      registrationDeadline: `${dayOffset(10)}T12:00`,
    });
    assert.equal(created.date, dayOffset(12));
    assert.equal(created.endDate, dayOffset(13));
    assert.equal(event.endDate, event.date, 'single-day events report endDate = date');

    const bad = await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ endDate: dayOffset(5) }) });
    assert.equal(bad.status, 422);
    assert.match(bad.body.errors.endDate, /before the start date/);

    const sameDay = await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ startTime: '10:00', endTime: '09:00' }) });
    assert.ok(sameDay.body.errors.endTime);
  });

  it('keeps an event running across days: status, listing, and attendance days', async () => {
    const hack = await t.createEvent(org.token, { name: 'Weekend Hack', date: dayOffset(5), endDate: dayOffset(7), registrationDeadline: `${dayOffset(3)}T12:00` });
    await t.api('POST', `/api/events/${hack.id}/registrations`, { token: alice.token });
    // Pretend it started yesterday and ends tomorrow.
    await query(`UPDATE events SET date = CURRENT_DATE - 1, end_date = CURRENT_DATE + 1, start_time = '00:00', end_time = '23:00', registration_deadline = NOW() - INTERVAL '2 days' WHERE id = $1`, [hack.id]);

    const detail = (await t.api('GET', `/api/events/${hack.id}`, { token: alice.token })).body.event;
    assert.equal(detail.status, 'ongoing');
    const listed = (await t.api('GET', '/api/events', { token: alice.token })).body.events.map((e) => e.name);
    assert.ok(listed.includes('Weekend Hack'));
    const byDate = (await t.api('GET', `/api/events?date=${dayOffset(1)}`, { token: alice.token })).body.events.map((e) => e.name);
    assert.deepEqual(byDate, ['Weekend Hack']);

    const mine = (await t.api('GET', '/api/registrations/mine', { token: alice.token })).body.registrations[0];
    const scan = await t.api('POST', `/api/events/${hack.id}/attendance/scan`, { token: org.token, json: { code: `EF1:${mine.qrToken}`, action: 'check_in' } });
    assert.equal(scan.status, 200, 'attendance is allowed on any day of a multi-day event');
  });
});

describe('schedule', () => {
  it('lets only the owning organizer create, edit and delete sessions', async () => {
    assert.equal((await addItem(alice.token, item())).status, 403);
    assert.equal((await addItem(org2.token, item())).status, 403);
    const created = await addItem(org.token, item());
    assert.equal(created.status, 201);
    assert.equal(created.body.item.sessionType, 'talk');

    const id = created.body.item.id;
    const patched = await t.api('PATCH', `/api/events/${event.id}/schedule/${id}`, { token: org.token, json: item({ title: 'Keynote (moved)', venue: 'Hall B' }) });
    assert.equal(patched.body.item.venue, 'Hall B');
    assert.equal((await t.api('PATCH', `/api/events/${event.id}/schedule/${id}`, { token: org2.token, json: item() })).status, 403);
    assert.equal((await t.api('DELETE', `/api/events/${event.id}/schedule/${id}`, { token: alice.token })).status, 403);
    assert.equal((await t.api('DELETE', `/api/events/${event.id}/schedule/${id}`, { token: org.token })).status, 204);
    assert.equal((await t.api('DELETE', `/api/events/${event.id}/schedule/${id}`, { token: org.token })).status, 404);
  });

  it('validates fields and keeps sessions within the event days', async () => {
    const bad = await addItem(org.token, item({ title: '', endTime: '09:00', sessionType: 'party' }));
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.title && bad.body.errors.endTime && bad.body.errors.sessionType);
    const outside = await addItem(org.token, item({ date: dayOffset(30) }));
    assert.equal(outside.status, 422);
    assert.match(outside.body.errors.date, /event day/);
  });

  it('lists sessions in order and tells participants what is on now and next', async () => {
    await addItem(org.token, item({ title: 'Lunch', startTime: '12:00', endTime: '13:00', sessionType: 'break' }));
    await addItem(org.token, item({ title: 'Workshop', startTime: '11:00', endTime: '12:00', sessionType: 'workshop' }));
    await addItem(org.token, item({ title: 'Talk', startTime: '09:00', endTime: '10:00' }));
    // Move the event to today so "now" lands inside one session.
    await query('UPDATE schedule_items SET date = CURRENT_DATE WHERE event_id = $1', [event.id]);
    await query('UPDATE events SET date = CURRENT_DATE WHERE id = $1', [event.id]);
    await query(`UPDATE schedule_items SET start_time = (NOW() - INTERVAL '10 minutes')::time, end_time = (NOW() + INTERVAL '40 minutes')::time WHERE event_id = $1 AND title = 'Talk'`, [event.id]);
    await query(`UPDATE schedule_items SET start_time = (NOW() + INTERVAL '50 minutes')::time, end_time = (NOW() + INTERVAL '55 minutes')::time WHERE event_id = $1 AND title = 'Workshop'`, [event.id]);
    await query(`UPDATE schedule_items SET start_time = (NOW() + INTERVAL '56 minutes')::time, end_time = (NOW() + INTERVAL '58 minutes')::time WHERE event_id = $1 AND title = 'Lunch'`, [event.id]);

    const res = await t.api('GET', `/api/events/${event.id}/schedule`, { token: alice.token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.items.map((i) => i.title), ['Talk', 'Workshop', 'Lunch']);
    assert.deepEqual(res.body.items.map((i) => i.status), ['ongoing', 'upcoming', 'upcoming']);
    assert.deepEqual(res.body.current.map((i) => i.title), ['Talk']);
    assert.equal(res.body.next.title, 'Workshop', 'breaks are never "up next"');
    assert.equal(res.body.todayCount, 3);
    assert.equal((await t.api('GET', '/api/events/99999/schedule', { token: alice.token })).status, 404);
    assert.equal((await t.api('GET', `/api/events/${event.id}/schedule`)).status, 401);
  });

  it("shows today's sessions only for events the participant holds a seat in", async () => {
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: alice.token });
    const mine = await t.api('GET', '/api/me/schedule/today', { token: alice.token });
    assert.deepEqual(mine.body.items.map((i) => i.title), ['Talk', 'Workshop', 'Lunch']);
    assert.equal(mine.body.items[0].eventName, 'Schedule Fest');
    assert.deepEqual((await t.api('GET', '/api/me/schedule/today', { token: outsider.token })).body.items, []);
    assert.equal((await t.api('GET', '/api/me/schedule/today', { token: org.token })).status, 403);
  });
});

describe('notifications', () => {
  it('confirms registrations and tells the organizer about ones needing approval', async () => {
    const aliceInbox = await inbox(alice.token);
    const received = aliceInbox.notifications.find((n) => n.type === 'registration_pending');
    assert.ok(received, 'participant is told the registration is pending');
    assert.equal(received.read, false);

    const orgInbox = await inbox(org.token);
    assert.ok(orgInbox.notifications.some((n) => n.type === 'new_registration' && n.message.includes('Alice Kumar')));

    const open = await t.createEvent(org.token, { name: 'Open Door' });
    await t.api('POST', `/api/events/${open.id}/registrations`, { token: bob.token });
    const bobInbox = await inbox(bob.token);
    assert.ok(bobInbox.notifications.some((n) => n.type === 'registration_confirmed' && /EF-\d{4}-\d{6}/.test(n.message)));
  });

  it('notifies on approval and rejection', async () => {
    const list = (await t.api('GET', `/api/organizer/participants?eventId=${event.id}`, { token: org.token })).body.registrations;
    const regId = list.find((r) => r.participantName === 'Alice Kumar').id;
    await t.api('PATCH', `/api/registrations/${regId}/status`, { token: org.token, json: { status: 'approved' } });
    const found = (await inbox(alice.token)).notifications.find((n) => n.type === 'registration_approved');
    assert.ok(found);
    assert.equal(found.link, `/events/${event.id}`);

    await t.api('PATCH', `/api/registrations/${regId}/status`, { token: org.token, json: { status: 'rejected' } });
    assert.ok((await inbox(alice.token)).notifications.some((n) => n.type === 'registration_rejected'));
    await t.api('PATCH', `/api/registrations/${regId}/status`, { token: org.token, json: { status: 'approved' } });
  });

  it('notifies registered participants when the schedule changes, but not outsiders', async () => {
    const before = (await inbox(alice.token)).notifications.length;
    const created = await addItem(org.token, item({ title: 'Surprise panel', date: dayOffset(0), startTime: '16:00', endTime: '17:00' }));
    assert.equal(created.status, 201);
    const after = (await inbox(alice.token)).notifications;
    assert.equal(after.length, before + 1);
    assert.equal(after[0].type, 'schedule_change');
    assert.match(after[0].message, /Surprise panel/);
    assert.equal((await inbox(outsider.token)).notifications.filter((n) => n.type === 'schedule_change').length, 0);
  });

  it('delivers announcements to registrants and staff, and keeps them readable only by members', async () => {
    await t.api('POST', `/api/events/${event.id}/staff`, { token: org.token, json: { email: 'out@x.com', role: 'volunteer' } });
    const sent = await t.api('POST', `/api/events/${event.id}/announcements`, { token: org.token, json: { title: 'Bring your ID', message: 'Entry needs a college ID card.' } });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.notified, 2, 'Alice (registered) and the volunteer');
    assert.ok((await inbox(alice.token)).notifications.some((n) => n.type === 'announcement' && n.title === 'Bring your ID'));
    assert.ok((await inbox(outsider.token)).notifications.some((n) => n.type === 'announcement'));
    assert.equal((await inbox(bob.token)).notifications.filter((n) => n.type === 'announcement').length, 0);

    const empty = await t.api('POST', `/api/events/${event.id}/announcements`, { token: org.token, json: { title: '', message: '' } });
    assert.equal(empty.status, 422);
    assert.equal((await t.api('POST', `/api/events/${event.id}/announcements`, { token: alice.token, json: { title: 'x', message: 'y' } })).status, 403);

    const read = (token) => t.api('GET', `/api/events/${event.id}/announcements`, { token });
    assert.equal((await read(alice.token)).body.announcements.length, 1);
    assert.equal((await read(org.token)).status, 200);
    assert.equal((await read(bob.token)).status, 403);
    assert.equal((await read(org2.token)).status, 403);
  });

  it('tracks read and unread, per user', async () => {
    const box = await inbox(alice.token);
    assert.ok(box.unreadCount >= 3);
    const first = box.notifications[0];

    const marked = await t.api('POST', `/api/notifications/${first.id}/read`, { token: alice.token });
    assert.equal(marked.body.unreadCount, box.unreadCount - 1);
    assert.equal((await t.api('POST', `/api/notifications/${first.id}/read`, { token: bob.token })).status, 404, "cannot touch someone else's");

    const unread = await inbox(alice.token, '?unread=1');
    assert.ok(unread.notifications.every((n) => !n.read));
    assert.equal(unread.notifications.length, box.unreadCount - 1);

    const all = await t.api('POST', '/api/notifications/read-all', { token: alice.token });
    assert.equal(all.body.unreadCount, 0);
    assert.equal((await inbox(alice.token, '?unread=1')).notifications.length, 0);
    assert.equal((await t.api('GET', '/api/notifications')).status, 401);

    const page = await inbox(alice.token, '?limit=2');
    assert.equal(page.notifications.length, 2);
    const older = await inbox(alice.token, `?limit=50&before=${page.notifications[1].id}`);
    assert.ok(older.notifications.every((n) => n.id < page.notifications[1].id));
  });
});

describe('reminders', () => {
  it('sends 24h, 1h and session reminders exactly once, only to people with seats', async () => {
    const soon = await t.createEvent(org.token, { name: 'Reminder Fest', date: dayOffset(2), startTime: '09:00', endTime: '17:00', registrationDeadline: `${dayOffset(1)}T09:00` });
    await t.api('POST', `/api/events/${soon.id}/registrations`, { token: alice.token });
    await t.api('POST', `/api/events/${soon.id}/registrations`, { token: bob.token });
    const bobReg = (await t.api('GET', '/api/registrations/mine', { token: bob.token })).body.registrations.find((r) => r.eventId === soon.id);
    await t.api('POST', `/api/registrations/${bobReg.id}/cancel`, { token: bob.token });
    await addItem(org.token, item({ title: 'Morning session', date: dayOffset(2), startTime: '09:30', endTime: '10:30' }), soon.id);

    const start = new Date(`${dayOffset(2)}T09:00:00`);
    const ago = (minutes) => new Date(start.getTime() - minutes * 60000);
    const countFor = async (token, type) => (await inbox(token, '?limit=50')).notifications.filter((n) => n.type === type && n.eventId === soon.id).length;

    await runReminders(ago(60 * 30)); // more than 24h away: nothing yet
    assert.equal(await countFor(alice.token, 'event_reminder'), 0);
    await runReminders(ago(60 * 20)); // 20h before: one 24h reminder (Alice only)
    await runReminders(ago(60 * 19)); // running again does not duplicate it
    assert.equal(await countFor(alice.token, 'event_reminder'), 1);
    assert.equal(await countFor(bob.token, 'event_reminder'), 0, 'cancelled registrations get nothing');

    await runReminders(ago(45)); // 45 min before: the 1h reminder
    assert.equal(await countFor(alice.token, 'event_reminder'), 2);

    // The session starts at 09:30; "starting soon" fires 15 minutes before it.
    await runReminders(new Date(start.getTime() + 20 * 60000)); // 09:20: the 09:30 session starts in 10 min (Alice only)
    assert.equal(await countFor(alice.token, 'session_starting'), 1);
    await runReminders(new Date(start.getTime() + 21 * 60000)); // no duplicate session reminder
    assert.equal(await countFor(bob.token, 'session_starting'), 0);

    const reminder = (await inbox(alice.token, '?limit=50')).notifications.find((n) => n.type === 'session_starting');
    assert.match(reminder.message, /Morning session/);
  });
});

describe('session attendance', () => {
  it('records a session scan, checks the person into the event too, and refuses duplicates', async () => {
    const day = await t.createEvent(org.token, { name: 'Session Day' });
    await t.api('POST', `/api/events/${day.id}/registrations`, { token: bob.token });
    const reg = (await t.api('GET', '/api/registrations/mine', { token: bob.token })).body.registrations.find((r) => r.eventId === day.id);
    const s1 = (await addItem(org.token, item({ title: 'Talk 1' }), day.id)).body.item;
    const s2 = (await addItem(org.token, item({ title: 'Talk 2', startTime: '11:00', endTime: '12:00' }), day.id)).body.item;
    await query('UPDATE events SET date = CURRENT_DATE WHERE id = $1', [day.id]);
    await query('UPDATE schedule_items SET date = CURRENT_DATE WHERE event_id = $1', [day.id]);

    const scan = (sessionId, action = 'check_in') =>
      t.api('POST', `/api/events/${day.id}/attendance/scan`, { token: org.token, json: { code: `EF1:${reg.qrToken}`, action, sessionId } });
    const first = await scan(s1.id);
    assert.equal(first.status, 200);
    assert.equal(first.body.session, 'Talk 1');
    assert.equal((await scan(s1.id)).status, 409);
    assert.equal((await scan(s2.id)).status, 200);
    assert.equal((await scan(s1.id, 'check_out')).status, 422);
    assert.equal((await scan(987654)).status, 404);

    const rows = await query('SELECT COUNT(*)::int AS n FROM session_attendance WHERE registration_id = $1', [reg.id]);
    assert.equal(rows[0].n, 2);
    const dash = await t.api('GET', `/api/events/${day.id}/attendance`, { token: org.token });
    assert.equal(dash.body.summary.attended, 1, 'event-level check-in was created automatically, once');
  });
});
