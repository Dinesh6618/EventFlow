import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

// Phase 2: registration lifecycle, capacity, approvals, organizer participant management.
let t;
let org;
let org2;
let alice;
let bob;
let carol;
let event;

const register = (token, id = event.id) => t.api('POST', `/api/events/${id}/registrations`, { token });
const cancel = (token, id) => t.api('POST', `/api/registrations/${id}/cancel`, { token });
const mine = async (token) => (await t.api('GET', '/api/registrations/mine', { token })).body.registrations;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  alice = await t.signUp('participant', 'alice@x.com', { name: 'Alice Kumar', department: 'CSE', college: 'ABC College' });
  bob = await t.signUp('participant', 'bob@x.com', { name: 'Bob Singh', department: 'ECE', college: 'XYZ Institute' });
  carol = await t.signUp('participant', 'carol@x.com', { name: 'Carol Das', department: 'CSE', college: 'XYZ Institute' });
  event = await t.createEvent(org.token, { name: 'Open Event', maxParticipants: '2' });
});
after(() => t.stop());

describe('registering', () => {
  it('registers a participant, gives a unique participant ID and confirms the seat', async () => {
    const res = await register(alice.token);
    assert.equal(res.status, 201);
    assert.equal(res.body.registration.status, 'confirmed');
    assert.match(res.body.registration.participantCode, /^EF-\d{4}-\d{6}$/);
    assert.equal(res.body.event.registeredCount, 1);
    assert.equal(res.body.event.availableSeats, 1);

    const second = await register(bob.token);
    assert.notEqual(second.body.registration.participantCode, res.body.registration.participantCode);
  });

  it('rejects duplicate registration for the same event', async () => {
    const res = await register(alice.token);
    assert.equal(res.status, 409);
    const rows = await query('SELECT COUNT(*)::int AS n FROM registrations WHERE user_id = $1', [alice.user.id]);
    assert.equal(rows[0].n, 1);
  });

  it('refuses registration when the event is full', async () => {
    const res = await register(carol.token);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /full/i);
  });

  it('only lets participants register', async () => {
    assert.equal((await register(org.token)).status, 403);
    assert.equal((await t.api('POST', `/api/events/${event.id}/registrations`)).status, 401);
    assert.equal((await register(alice.token, 99999)).status, 404);
  });

  it('requires department and college on the profile', async () => {
    const bare = await t.signUp('participant', 'bare@x.com');
    await query('UPDATE users SET department = NULL WHERE id = $1', [bare.user.id]);
    const res = await register(bare.token);
    assert.equal(res.status, 422);
    assert.ok(res.body.errors.profile);
  });

  it('never oversells under concurrent registrations', async () => {
    const small = await t.createEvent(org.token, { name: 'Tiny Event', maxParticipants: '2' });
    const people = await Promise.all([1, 2, 3, 4, 5].map((n) => t.signUp('participant', `race${n}@x.com`)));
    const results = await Promise.all(people.map((p) => register(p.token, small.id)));
    assert.equal(results.filter((r) => r.status === 201).length, 2);
    assert.equal(results.filter((r) => r.status === 409).length, 3);
    const after = await t.api('GET', `/api/events/${small.id}`, { token: org.token });
    assert.equal(after.body.event.registeredCount, 2);
    assert.equal(after.body.event.availableSeats, 0);
  });

  it('closes registration after the deadline and for finished events', async () => {
    const past = await t.createEvent(org.token, { name: 'Soon', registrationDeadline: `${dayOffset(8)}T12:00` });
    await query(`UPDATE events SET registration_deadline = NOW() - INTERVAL '1 hour' WHERE id = $1`, [past.id]);
    const res = await register(carol.token, past.id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /closed/i);

    const done = await t.createEvent(org.token, { name: 'Done' });
    await query(`UPDATE events SET date = CURRENT_DATE - 3, registration_deadline = NOW() - INTERVAL '5 days' WHERE id = $1`, [done.id]);
    assert.match((await register(carol.token, done.id)).body.message, /ended/i);
  });
});

describe('cancelling and history', () => {
  it('lets a participant cancel, frees the seat and allows re-registering with the same ID', async () => {
    const [reg] = await mine(bob.token);
    assert.equal(reg.status, 'confirmed');

    const cancelled = await cancel(bob.token, reg.id);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.registration.status, 'cancelled');
    assert.equal(cancelled.body.event.availableSeats, 1);

    assert.equal((await cancel(bob.token, reg.id)).status, 409);

    // Seat freed: Carol can take it, then Bob cannot come back.
    assert.equal((await register(carol.token)).status, 201);
    assert.equal((await register(bob.token)).status, 409);

    // Carol cancels, Bob re-registers and keeps his original participant ID.
    const carolReg = (await mine(carol.token))[0];
    await cancel(carol.token, carolReg.id);
    const again = await register(bob.token);
    assert.equal(again.status, 201);
    assert.equal(again.body.registration.participantCode, reg.participantCode);
    assert.equal(again.body.registration.status, 'confirmed');
  });

  it("does not let one participant cancel another's registration", async () => {
    const [aliceReg] = await mine(alice.token);
    assert.equal((await cancel(bob.token, aliceReg.id)).status, 404);
  });

  it('lists personal history with event details and status', async () => {
    const list = await mine(alice.token);
    assert.equal(list.length, 1);
    assert.equal(list[0].eventName, 'Open Event');
    assert.equal(list[0].eventStatus, 'upcoming');
    assert.equal((await t.api('GET', '/api/registrations/mine', { token: org.token })).status, 403);
  });

  it('returns the participant\'s own registration with the event, and counts views', async () => {
    const res = await t.api('GET', `/api/events/${event.id}`, { token: alice.token });
    assert.equal(res.body.registration.status, 'confirmed');
    const views = await query('SELECT COUNT(*)::int AS n FROM event_views WHERE event_id = $1', [event.id]);
    assert.ok(views[0].n >= 1);
  });
});

describe('approval workflow', () => {
  let gated;
  let regId;

  before(async () => {
    gated = await t.createEvent(org.token, { name: 'Gated Event', maxParticipants: '1', requiresApproval: 'true' });
  });

  it('keeps registrations pending and holds the seat until the organizer decides', async () => {
    const res = await register(alice.token, gated.id);
    assert.equal(res.body.registration.status, 'pending');
    regId = res.body.registration.id;
    assert.equal(res.body.event.availableSeats, 0);
    assert.equal((await register(bob.token, gated.id)).status, 409);
  });

  it('lets only the owning organizer approve or reject', async () => {
    const decide = (token, status, id = regId) => t.api('PATCH', `/api/registrations/${id}/status`, { token, json: { status } });
    assert.equal((await decide(alice.token, 'approved')).status, 403);
    assert.equal((await decide(org2.token, 'approved')).status, 404);
    assert.equal((await decide(org.token, 'confirmed')).status, 422);

    const rejected = await decide(org.token, 'rejected');
    assert.equal(rejected.body.registration.status, 'rejected');

    // Rejection frees the seat; the rejected person cannot self-register again.
    assert.equal((await register(alice.token, gated.id)).status, 409);
    const bobReg = await register(bob.token, gated.id);
    assert.equal(bobReg.status, 201);

    // Seat is taken again, so the rejected registration cannot be re-approved.
    const blocked = await decide(org.token, 'approved');
    assert.equal(blocked.status, 409);

    const approved = await decide(org.token, 'approved', bobReg.body.registration.id);
    assert.equal(approved.body.registration.status, 'approved');
    assert.equal((await decide(org.token, 'approved', bobReg.body.registration.id)).status, 409);
  });
});

describe('organizer participant management', () => {
  const list = async (qs = '', token = org.token) => (await t.api('GET', `/api/organizer/participants${qs}`, { token })).body;

  it('lists participants of the organizer\'s events only', async () => {
    const all = await list();
    assert.ok(all.total >= 3);
    assert.ok(all.registrations.every((r) => r.participantName && r.email && r.participantCode));
    assert.deepEqual(all.departments, ['CSE', 'ECE']);
    assert.deepEqual(all.colleges, ['ABC College', 'XYZ Institute']);

    const other = await list('', org2.token);
    assert.equal(other.total, 0);
  });

  it('searches and filters by event, department, college and status', async () => {
    assert.deepEqual((await list('?q=alice')).registrations.map((r) => r.participantName), ['Alice Kumar', 'Alice Kumar']);
    assert.ok((await list('?q=EF-')).total >= 3);
    assert.ok((await list(`?eventId=${event.id}`)).registrations.every((r) => r.eventName === 'Open Event'));
    assert.ok((await list('?department=ECE')).registrations.every((r) => r.department === 'ECE'));
    assert.ok((await list('?college=XYZ%20Institute')).registrations.every((r) => r.college === 'XYZ Institute'));
    assert.ok((await list('?status=cancelled')).registrations.every((r) => r.status === 'cancelled'));
    assert.equal((await t.api('GET', '/api/organizer/participants?status=bogus', { token: org.token })).status, 422);
    assert.equal((await list('?q=%25%25')).total, 0);
  });

  it('paginates', async () => {
    const page = await list('?pageSize=1&page=2');
    assert.equal(page.registrations.length, 1);
    assert.equal(page.pageSize, 1);
  });

  it('shows participant details to the owning organizer only', async () => {
    const first = (await list()).registrations[0];
    const detail = await t.api('GET', `/api/registrations/${first.id}`, { token: org.token });
    assert.equal(detail.status, 200);
    assert.ok(detail.body.registration.email);
    assert.equal((await t.api('GET', `/api/registrations/${first.id}`, { token: org2.token })).status, 404);
  });

  it('exports a CSV with the same filters and protects against formula injection', async () => {
    const evil = await t.signUp('participant', 'evil@x.com', { name: '=HYPERLINK("http://bad")', department: 'CSE', college: 'ABC College' });
    await register(evil.token, (await t.createEvent(org.token, { name: 'CSV Event' })).id);

    const res = await t.api('GET', '/api/organizer/participants/export?department=CSE', { token: org.token });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    assert.match(res.headers.get('content-disposition'), /attachment/);
    const lines = res.body.replace('﻿', '').trim().split('\r\n');
    assert.equal(lines[0], 'Participant ID,Name,Email,Department,College,Event,Status,Registered at');
    assert.ok(lines.some((l) => l.includes('Alice Kumar')));
    assert.ok(!lines.some((l) => l.includes('Bob Singh')), 'filter must apply to the export');
    assert.ok(lines.some((l) => l.includes(`"'=HYPERLINK(""http://bad"")"`)), 'formulas must be neutralised');

    assert.equal((await t.api('GET', '/api/organizer/participants/export', { token: alice.token })).status, 403);
    assert.equal((await t.api('GET', `/api/organizer/participants/export?eventId=${event.id}`, { token: org2.token })).status, 403);
  });

  it('feeds the dashboard participant count', async () => {
    const stats = await t.api('GET', '/api/organizer/stats', { token: org.token });
    assert.ok(stats.body.stats.totalParticipants >= 3);
  });
});
