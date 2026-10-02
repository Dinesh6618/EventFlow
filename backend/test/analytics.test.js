import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

// Phase 8: analytics computed from real records. Every figure below is derived by hand from the setup.
let t;
let org;
let org2;
let eventA;
let eventB;
const p = {};
const get = async (qs = '', token = org.token) => t.api('GET', `/api/organizer/analytics${qs}`, { token });

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  const people = [['ann', 'CSE', 'ABC College'], ['ben', 'CSE', 'ABC College'], ['cam', 'ECE', 'XYZ Institute'], ['dee', 'ECE', 'XYZ Institute'], ['eve', 'IT', 'XYZ Institute'], ['fox', 'IT', 'XYZ Institute']];
  for (const [n, department, college] of people) p[n] = await t.signUp('participant', `${n}@x.com`, { name: n[0].toUpperCase() + n.slice(1), department, college });

  eventA = await t.createEvent(org.token, { name: 'Hack A', type: 'Hackathon', maxParticipants: '10', teamEnabled: 'true', minTeamSize: '1', maxTeamSize: '3' });
  eventB = await t.createEvent(org.token, { name: 'Workshop B', type: 'Workshop', maxParticipants: '5' });

  // Everyone opens Hack A's page (6 viewers); five register, Eve then cancels, Fox never registers.
  for (const n of ['ann', 'ben', 'cam', 'dee', 'eve', 'fox']) await t.api('GET', `/api/events/${eventA.id}`, { token: p[n].token });
  for (const n of ['ann', 'ben', 'cam', 'dee', 'eve']) await t.api('POST', `/api/events/${eventA.id}/registrations`, { token: p[n].token });
  const eveReg = (await t.api('GET', '/api/registrations/mine', { token: p.eve.token })).body.registrations[0];
  await t.api('POST', `/api/registrations/${eveReg.id}/cancel`, { token: p.eve.token });
  await t.api('POST', `/api/events/${eventB.id}/registrations`, { token: p.ann.token });

  await t.api('POST', `/api/events/${eventA.id}/teams`, { token: p.ann.token, json: { name: 'Ann Team', skills: [] } }); // engagement: Ann
  const session = (await t.api('POST', `/api/events/${eventA.id}/schedule`, { token: org.token, json: {
    title: 'Opening', date: dayOffset(10), startTime: '09:00', endTime: '10:00', venue: 'Hall', speaker: '', sessionType: 'talk', description: '',
  } })).body.item;

  const regs = (await t.api('GET', `/api/organizer/participants?eventId=${eventA.id}&pageSize=50`, { token: org.token })).body.registrations;
  const reg = (name) => regs.find((r) => r.participantName === name);
  for (const name of ['Ann', 'Ben']) await query(`INSERT INTO attendance (registration_id, event_id, user_id, status) VALUES ($1, $2, $3, 'checked_in')`, [reg(name).id, eventA.id, reg(name).userId]);
  await query(`INSERT INTO session_attendance (session_id, registration_id) VALUES ($1, $2)`, [session.id, reg('Cam').id]); // engagement: Cam

  // The event is over: Ben leaves feedback (engagement: Ben) and Ann and Ben get certificates.
  await query(`UPDATE events SET date = CURRENT_DATE - 2, registration_deadline = NOW() - INTERVAL '5 days' WHERE id = $1`, [eventA.id]);
  await query(`UPDATE schedule_items SET date = CURRENT_DATE - 2 WHERE id = $1`, [session.id]);
  await t.api('PUT', `/api/events/${eventA.id}/feedback`, { token: p.ben.token, json: { overall: 4, organization: 4 } });
  await t.api('POST', `/api/events/${eventA.id}/certificates`, { token: org.token, json: { type: 'participant' } });
});
after(() => t.stop());

describe('analytics summary', () => {
  it('requires an organizer and only ever shows that organizer\'s events', async () => {
    assert.equal((await t.api('GET', '/api/organizer/analytics')).status, 401);
    assert.equal((await get('', p.ann.token)).status, 403);
    const other = await get('', org2.token);
    assert.equal(other.status, 200);
    assert.equal(other.body.summary.events, 0);
    assert.equal(other.body.summary.totalRegistrations, 0);
    assert.deepEqual(other.body.performance, []);
  });

  it('counts registrations, attendance, conversion, engagement, feedback and certificates from the records', async () => {
    const { body } = await get(`?eventId=${eventA.id}`);
    assert.equal(body.summary.events, 1);
    assert.equal(body.summary.totalRegistrations, 4, 'Eve cancelled, so four seats');
    assert.equal(body.summary.totalAttendance, 2);
    assert.equal(body.summary.attendanceRate, 50, '2 of the 4 approved/confirmed');
    assert.equal(body.summary.pageViewers, 6);
    assert.equal(body.summary.registrationConversion, 66.7, '4 of the 6 who opened the page');
    assert.equal(body.summary.teamCount, 1);
    assert.equal(body.summary.averageFeedback, 4);
    assert.equal(body.summary.feedbackResponses, 1);
    assert.equal(body.summary.certificateCount, 2);

    const [row] = body.performance;
    assert.equal(row.name, 'Hack A');
    assert.equal(row.fillRate, 40, '4 of 10 seats');
    assert.equal(row.engagement, 75, 'Ann (team), Ben (feedback), Cam (session) of 4');
    assert.equal(row.completion, 50, 'two of four hold a participation certificate');
    assert.equal(row.feedbackAverage, 4);
  });

  it('combines events and filters by event, type and date range', async () => {
    const all = (await get()).body;
    assert.equal(all.summary.events, 2);
    assert.equal(all.summary.totalRegistrations, 5);
    assert.deepEqual(all.performance.map((x) => x.name), ['Hack A', 'Workshop B'], 'sorted by date');

    assert.deepEqual((await get('?type=Workshop')).body.performance.map((x) => x.name), ['Workshop B']);
    assert.deepEqual((await get(`?eventId=${eventB.id}`)).body.summary.totalAttendance, 0);
    assert.equal((await get(`?from=${dayOffset(5)}`)).body.summary.events, 1, 'only the future workshop starts after that date');
    assert.equal((await get(`?to=${dayOffset(-1)}`)).body.summary.events, 1, 'only Hack A is already over');
    assert.equal((await get(`?from=${dayOffset(100)}`)).body.summary.events, 0);

    assert.equal((await get('?type=Party')).status, 422);
    assert.equal((await get('?from=nope')).status, 422);
    assert.equal((await get(`?from=${dayOffset(5)}&to=${dayOffset(1)}`)).status, 422);
  });

  it('reports zero rather than inventing numbers when there is no data', async () => {
    const { body } = await get(`?eventId=${eventB.id}`);
    assert.equal(body.summary.registrationConversion, 0);
    assert.equal(body.summary.averageFeedback, null);
    assert.equal(body.performance[0].feedbackAverage, null);
    assert.equal(body.performance[0].attendanceRate, 0);
    assert.deepEqual(body.charts.attendanceTrend.points, []);
  });
});

describe('analytics charts', () => {
  let charts;
  before(async () => {
    charts = (await get()).body.charts;
  });

  it('builds the registration trend with a running total', () => {
    const total = charts.registrationTrend.reduce((sum, d) => sum + d.value, 0);
    assert.equal(total, 5);
    assert.equal(charts.registrationTrend.at(-1).total, 5);
    assert.match(charts.registrationTrend[0].label, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('groups check-ins by hour when they happen on one day', () => {
    assert.equal(charts.attendanceTrend.granularity, 'hour');
    assert.equal(charts.attendanceTrend.points.reduce((sum, d) => sum + d.value, 0), 2);
  });

  it('splits registrations by department and college, and by event type', () => {
    const names = (rows) => Object.fromEntries(rows.map((r) => [r.name, r.value]));
    assert.deepEqual(names(charts.departments), { CSE: 3, ECE: 2 });
    assert.deepEqual(names(charts.colleges), { 'ABC College': 3, 'XYZ Institute': 2 });
    const types = Object.fromEntries(charts.eventTypes.map((x) => [x.name, [x.events, x.value, x.attendance]]));
    assert.deepEqual(types, { Hackathon: [1, 4, 2], Workshop: [1, 1, 0] });
  });

  it('reports session attendance and the feedback spread', () => {
    assert.equal(charts.sessionAttendance.length, 1);
    assert.deepEqual([charts.sessionAttendance[0].label.startsWith('Opening'), charts.sessionAttendance[0].value, charts.sessionAttendance[0].percentage], [true, 1, 25]);
    assert.deepEqual(charts.feedbackRatings, [{ rating: 5, value: 0 }, { rating: 4, value: 1 }, { rating: 3, value: 0 }, { rating: 2, value: 0 }, { rating: 1, value: 0 }]);
  });

  it('folds a long tail of departments into "Other"', async () => {
    const big = await t.createEvent(org.token, { name: 'Big Event', maxParticipants: '50' });
    for (let i = 1; i <= 9; i += 1) {
      const user = await t.signUp('participant', `dept${i}@x.com`, { department: `Dept ${i}`, college: 'ABC College' });
      assert.equal((await t.api('POST', `/api/events/${big.id}/registrations`, { token: user.token })).status, 201);
    }
    const rows = (await get(`?eventId=${big.id}`)).body.charts.departments;
    assert.ok(rows.length <= 8, 'at most seven groups plus Other');
    assert.equal(rows.at(-1).name, 'Other');
  });
});

describe('analytics export', () => {
  it('exports the performance table as CSV with the same filters', async () => {
    const res = await t.api('GET', `/api/organizer/analytics/export?eventId=${eventA.id}`, { token: org.token });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/csv/);
    const lines = res.body.replace('﻿', '').trim().split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith('Event,Type,Date,Capacity,Registrations,Fill rate'));
    assert.ok(lines[1].startsWith('Hack A,Hackathon,'));
    assert.ok(lines[1].includes('40%') && lines[1].includes('66.7%'));
    assert.equal((await t.api('GET', '/api/organizer/analytics/export', { token: p.ann.token })).status, 403);
  });
});
