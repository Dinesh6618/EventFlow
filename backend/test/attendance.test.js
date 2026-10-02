import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

// Phase 3: QR attendance, volunteers, attendance dashboard.
let t;
let org;
let org2;
let volunteer;
let alice;
let bob;
let carol;
let event;
let aliceReg;
let bobReg;
let tokenOf;

const scan = (token, code, action = 'check_in', eventId = event.id) =>
  t.api('POST', `/api/events/${eventId}/attendance/scan`, { token, json: { code, action } });
const mine = async (token) => (await t.api('GET', '/api/registrations/mine', { token })).body.registrations;
const dash = (token, qs = '', eventId = event.id) => t.api('GET', `/api/events/${eventId}/attendance${qs}`, { token });

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  volunteer = await t.signUp('participant', 'vol@x.com', { name: 'Vera Volunteer' });
  alice = await t.signUp('participant', 'alice@x.com', { name: 'Alice Kumar' });
  bob = await t.signUp('participant', 'bob@x.com', { name: 'Bob Singh' });
  carol = await t.signUp('participant', 'carol@x.com', { name: 'Carol Das' });

  event = await t.createEvent(org.token, { name: 'Scan Day', requiresApproval: 'true' });
  const reg = (u) => t.api('POST', `/api/events/${event.id}/registrations`, { token: u.token });
  await reg(alice);
  await reg(bob);
  await reg(carol);
  const list = (await t.api('GET', '/api/organizer/participants', { token: org.token })).body.registrations;
  const idOf = (name) => list.find((r) => r.participantName === name).id;
  // Alice and Bob approved; Carol stays pending.
  for (const name of ['Alice Kumar', 'Bob Singh']) {
    await t.api('PATCH', `/api/registrations/${idOf(name)}/status`, { token: org.token, json: { status: 'approved' } });
  }
  aliceReg = (await mine(alice.token))[0];
  bobReg = (await mine(bob.token))[0];
  tokenOf = (r) => `EF1:${r.qrToken}`;
});
after(() => t.stop());

describe('QR codes', () => {
  it('gives a random token only to people whose registration entitles them to attend', async () => {
    assert.match(aliceReg.qrToken, /^[0-9a-f]{64}$/);
    assert.notEqual(aliceReg.qrToken, bobReg.qrToken);
    const carolReg = (await mine(carol.token))[0];
    assert.equal(carolReg.status, 'pending');
    assert.equal(carolReg.qrToken, null);
  });

  it('never exposes tokens or QR data to organizers through participant lists', async () => {
    const list = await t.api('GET', '/api/organizer/participants', { token: org.token });
    assert.ok(!JSON.stringify(list.body).includes(aliceReg.qrToken));
    const detail = await t.api('GET', `/api/registrations/${aliceReg.id}`, { token: org.token });
    assert.ok(!JSON.stringify(detail.body).includes(aliceReg.qrToken));
  });

  it('keeps personal data out of the QR payload', () => {
    assert.ok(!tokenOf(aliceReg).toLowerCase().includes('alice'));
    assert.ok(!tokenOf(aliceReg).includes(String(aliceReg.id).padStart(6, '0')));
  });
});

describe('scanning', () => {
  before(async () => {
    // Attendance only opens on the day of the event.
    await query("UPDATE events SET date = CURRENT_DATE, start_time = '00:00', end_time = '23:59' WHERE id = $1", [event.id]);
  });

  it('refuses scans before the event day', async () => {
    const later = await t.createEvent(org.token, { name: 'Future Day' });
    await t.api('POST', `/api/events/${later.id}/registrations`, { token: bob.token });
    const reg = (await mine(bob.token)).find((r) => r.eventId === later.id);
    const res = await scan(org.token, tokenOf(reg), 'check_in', later.id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /day of the event/);
  });

  it('checks a participant in and returns who they are', async () => {
    const res = await scan(org.token, tokenOf(aliceReg));
    assert.equal(res.status, 200);
    assert.equal(res.body.result, 'checked_in');
    assert.equal(res.body.participant.name, 'Alice Kumar');
    assert.equal(res.body.participant.participantCode, aliceReg.participantCode);
  });

  it('prevents duplicate check-in and records the first time', async () => {
    const again = await scan(org.token, tokenOf(aliceReg));
    assert.equal(again.status, 409);
    assert.match(again.body.message, /already checked in at/);
    const rows = await query('SELECT COUNT(*)::int AS n FROM attendance WHERE registration_id = $1', [aliceReg.id]);
    assert.equal(rows[0].n, 1);
  });

  it('accepts the bare token too, but rejects malformed or unknown codes', async () => {
    assert.equal((await scan(org.token, bobReg.qrToken)).status, 200);
    assert.equal((await scan(org.token, 'hello world')).status, 422);
    assert.equal((await scan(org.token, `EF1:${'0'.repeat(64)}`)).status, 404);
    assert.equal((await scan(org.token, `EF1:${aliceReg.qrToken.slice(0, 63)}`)).status, 422);
  });

  it('handles check-out rules', async () => {
    const out = await scan(org.token, tokenOf(aliceReg), 'check_out');
    assert.equal(out.body.result, 'checked_out');
    const twice = await scan(org.token, tokenOf(aliceReg), 'check_out');
    assert.equal(twice.status, 409);
    assert.match(twice.body.message, /already checked out/);
    const noIn = await t.signUp('participant', 'dave@x.com', { name: 'Dave' });
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: noIn.token });
    const list = (await t.api('GET', '/api/organizer/participants?q=Dave', { token: org.token })).body.registrations;
    await t.api('PATCH', `/api/registrations/${list[0].id}/status`, { token: org.token, json: { status: 'approved' } });
    const daveReg = (await mine(noIn.token))[0];
    const early = await scan(org.token, tokenOf(daveReg), 'check_out');
    assert.equal(early.status, 409);
    assert.match(early.body.message, /not checked in/);
  });

  it('rejects registrations that are not approved/confirmed and codes for other events', async () => {
    // Carol is pending, so she has no QR; reject Bob later and his old code stops working.
    await t.api('PATCH', `/api/registrations/${bobReg.id}/status`, { token: org.token, json: { status: 'rejected' } });
    const blocked = await scan(org.token, tokenOf(bobReg), 'check_out');
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.message, /rejected/);

    const other = await t.createEvent(org.token, { name: 'Other Event' });
    const wrong = await scan(org.token, tokenOf(aliceReg), 'check_in', other.id);
    assert.equal(wrong.status, 409);
    assert.match(wrong.body.message, /different event/);
  });

  it('invalidates the old QR when someone cancels and registers again', async () => {
    const fresh = await t.createEvent(org.token, { name: 'Re-register Event' });
    await t.api('POST', `/api/events/${fresh.id}/registrations`, { token: carol.token });
    const before = (await mine(carol.token)).find((r) => r.eventId === fresh.id);
    await t.api('POST', `/api/registrations/${before.id}/cancel`, { token: carol.token });
    await t.api('POST', `/api/events/${fresh.id}/registrations`, { token: carol.token });
    const after = (await mine(carol.token)).find((r) => r.eventId === fresh.id);
    assert.notEqual(after.qrToken, before.qrToken);
    await query("UPDATE events SET date = CURRENT_DATE, start_time = '00:00', end_time = '23:59' WHERE id = $1", [fresh.id]);
    assert.equal((await scan(org.token, tokenOf(before), 'check_in', fresh.id)).status, 404);
    assert.equal((await scan(org.token, tokenOf(after), 'check_in', fresh.id)).status, 200);
  });

  it('stops attendance once the event has ended', async () => {
    const done = await t.createEvent(org.token, { name: 'Over' });
    await t.api('POST', `/api/events/${done.id}/registrations`, { token: alice.token });
    const reg = (await mine(alice.token)).find((r) => r.eventId === done.id);
    await query(`UPDATE events SET date = CURRENT_DATE - 1, registration_deadline = NOW() - INTERVAL '3 days' WHERE id = $1`, [done.id]);
    const res = await scan(org.token, tokenOf(reg), 'check_in', done.id);
    assert.equal(res.status, 409);
    assert.match(res.body.message, /ended/);
  });
});

describe('authorization', () => {
  it('blocks outsiders, other organizers and unauthenticated callers', async () => {
    const code = tokenOf(aliceReg);
    assert.equal((await scan(undefined, code)).status, 401);
    assert.equal((await scan(alice.token, code, 'check_out')).status, 403);
    assert.equal((await scan(org2.token, code, 'check_out')).status, 403);
    assert.equal((await scan(volunteer.token, code, 'check_out')).status, 403);
  });

  it('lets only the owning organizer manage volunteers', async () => {
    const add = (token, email = 'vol@x.com') => t.api('POST', `/api/events/${event.id}/staff`, { token, json: { email, role: 'volunteer' } });
    assert.equal((await add(alice.token)).status, 403);
    assert.equal((await add(org2.token)).status, 403);
    assert.equal((await add(org.token, 'nobody@x.com')).status, 422);
    assert.equal((await add(org.token, 'org2@x.com')).status, 422);
    const ok = await add(org.token);
    assert.equal(ok.status, 201);
    assert.equal(ok.body.staff.name, 'Vera Volunteer');
    assert.equal((await add(org.token)).status, 409);
    const list = await t.api('GET', `/api/events/${event.id}/staff`, { token: org.token });
    assert.equal(list.body.staff.length, 1);
  });

  it('lets an assigned volunteer scan, and shows assignments', async () => {
    const assignments = await t.api('GET', '/api/me/assignments', { token: volunteer.token });
    assert.deepEqual(assignments.body.assignments.map((a) => [a.eventId, a.staffRole]), [[event.id, 'volunteer']]);
    assert.equal((await t.api('GET', '/api/me/assignments', { token: org.token })).status, 403);

    const dave = (await t.api('GET', '/api/organizer/participants?q=Dave', { token: org.token })).body.registrations[0];
    const daveToken = (await query('SELECT qr_token FROM registrations WHERE id = $1', [dave.id]))[0].qr_token;
    const res = await scan(volunteer.token, `EF1:${daveToken}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.participant.name, 'Dave');

    // Volunteers cannot use organizer-only actions.
    const manual = await t.api('POST', `/api/events/${event.id}/attendance/manual`, {
      token: volunteer.token,
      json: { registrationId: dave.id, action: 'check_out' },
    });
    assert.equal(manual.status, 403);
    assert.equal((await t.api('GET', `/api/events/${event.id}/attendance/export`, { token: volunteer.token })).status, 403);
  });

  it('removes volunteer access when the organizer removes them', async () => {
    const [member] = (await t.api('GET', `/api/events/${event.id}/staff`, { token: org.token })).body.staff;
    assert.equal((await t.api('DELETE', `/api/events/${event.id}/staff/${member.id}`, { token: org.token })).status, 204);
    const code = tokenOf(aliceReg);
    assert.equal((await scan(volunteer.token, code, 'check_out')).status, 403);
  });
});

describe('attendance dashboard', () => {
  it('counts registered, checked in, not checked in and the percentage', async () => {
    const res = await dash(org.token);
    assert.equal(res.status, 200);
    // Alice (checked out), Bob (rejected, excluded), Dave (checked in), Carol pending (excluded).
    assert.deepEqual(res.body.summary, {
      totalRegistered: 2,
      checkedIn: 1,
      checkedOut: 1,
      attended: 2,
      notCheckedIn: 0,
      absent: 0,
      attendancePercentage: 100,
    });
    assert.equal(res.body.attendees.length, 2);
    assert.equal(res.body.recent.length, 3); // includes Bob, who checked in before being rejected
  });

  it('filters the attendee list and supports manual check-in', async () => {
    const pending = await t.signUp('participant', 'erin@x.com', { name: 'Erin' });
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: pending.token });
    const erin = (await t.api('GET', '/api/organizer/participants?q=Erin', { token: org.token })).body.registrations[0];
    await t.api('PATCH', `/api/registrations/${erin.id}/status`, { token: org.token, json: { status: 'approved' } });

    let res = await dash(org.token, '?state=registered');
    assert.deepEqual(res.body.attendees.map((a) => a.name), ['Erin']);
    assert.equal(res.body.summary.attendancePercentage, 66.7);
    assert.equal(res.body.summary.notCheckedIn, 1);

    const manual = await t.api('POST', `/api/events/${event.id}/attendance/manual`, {
      token: org.token,
      json: { registrationId: erin.id, action: 'check_in' },
    });
    assert.equal(manual.status, 200);
    assert.equal((await t.api('POST', `/api/events/${event.id}/attendance/manual`, { token: org.token, json: { registrationId: erin.id, action: 'check_in' } })).status, 409);

    res = await dash(org.token, '?q=erin&state=checked_in');
    assert.equal(res.body.attendees.length, 1);
    assert.equal(res.body.summary.attendancePercentage, 100);
  });

  it('shows volunteers the numbers but not the participant list', async () => {
    await t.api('POST', `/api/events/${event.id}/staff`, { token: org.token, json: { email: 'vol@x.com', role: 'volunteer' } });
    const res = await dash(volunteer.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.capacity, 'volunteer');
    assert.equal(res.body.attendees, undefined);
    assert.ok(res.body.summary.totalRegistered >= 3);
    assert.equal((await dash(alice.token)).status, 403);
    assert.equal((await dash(org2.token)).status, 403);
  });

  it('marks people absent after the event ends and exports CSV', async () => {
    const frank = await t.signUp('participant', 'frank@x.com', { name: 'Frank' });
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: frank.token });
    const row = (await t.api('GET', '/api/organizer/participants?q=Frank', { token: org.token })).body.registrations[0];
    await t.api('PATCH', `/api/registrations/${row.id}/status`, { token: org.token, json: { status: 'approved' } });

    await query(`UPDATE events SET date = CURRENT_DATE - 2, registration_deadline = NOW() - INTERVAL '4 days' WHERE id = $1`, [event.id]);
    const res = await dash(org.token);
    assert.equal(res.body.event.status, 'ended');
    assert.equal(res.body.summary.absent, 1);
    assert.equal(res.body.attendees.find((a) => a.name === 'Frank').state, 'absent');

    const csv = await t.api('GET', `/api/events/${event.id}/attendance/export`, { token: org.token });
    assert.equal(csv.status, 200);
    assert.match(csv.body, /Participant ID,Name,Email,Department,College,Status,Check-in time,Check-out time/);
    assert.match(csv.body, /Alice Kumar/);
  });
});
