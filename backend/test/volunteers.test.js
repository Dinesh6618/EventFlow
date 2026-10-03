import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { query, startServer } from './helpers.js';

// Volunteer platform: students apply, the organizer approves or declines, approval grants the volunteer role.
let t;
let org;
let org2;
let ann;
let ben;
let event;

const api = (method, url, token, json) => t.api(method, url, { token, json });
const apply = (token, message, eventId = event.id) => api('POST', `/api/events/${eventId}/volunteer-applications`, token, message === undefined ? {} : { message });
const applications = async () => (await api('GET', `/api/events/${event.id}/volunteer-applications`, org.token)).body.applications;
const myAssignments = async (token) => (await api('GET', '/api/me/assignments', token)).body.assignments;
const inbox = async (token) => (await api('GET', '/api/notifications', token)).body;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  ann = await t.signUp('participant', 'ann@x.com', { name: 'Ann Kumar' });
  ben = await t.signUp('participant', 'ben@x.com', { name: 'Ben Singh' });
  event = await t.createEvent(org.token, { name: 'Volunteer Fest' });
});
after(() => t.stop());

describe('volunteer opportunities', () => {
  it('lists upcoming events for students only, with their own application status', async () => {
    const mine = (await api('GET', '/api/volunteer/opportunities', ann.token)).body.opportunities;
    const row = mine.find((o) => o.eventId === event.id);
    assert.ok(row, 'the upcoming event is listed');
    assert.equal(row.applicationStatus, null);
    assert.equal(row.isVolunteer, false);
    assert.equal((await api('GET', '/api/volunteer/opportunities', org.token)).status, 403);
    assert.equal((await t.api('GET', '/api/volunteer/opportunities')).status, 401);
  });

  it('leaves out events that have ended', async () => {
    const old = await t.createEvent(org.token, { name: 'Old Fest' });
    await query(`UPDATE events SET date = CURRENT_DATE - 5, end_date = NULL, registration_deadline = NOW() - INTERVAL '9 days' WHERE id = $1`, [old.id]);
    const ids = (await api('GET', '/api/volunteer/opportunities', ann.token)).body.opportunities.map((o) => o.eventId);
    assert.ok(!ids.includes(old.id));
    assert.equal((await apply(ann.token, 'hi', old.id)).status, 409);
  });
});

describe('applying', () => {
  it('records an application, notifies the organizer, and refuses a repeat', async () => {
    assert.equal((await apply(ann.token, 'I helped at last year\'s fest')).status, 201);
    const list = await applications();
    assert.equal(list.length, 1);
    assert.deepEqual([list[0].name, list[0].status, list[0].message], ['Ann Kumar', 'pending', 'I helped at last year\'s fest']);
    assert.ok((await inbox(org.token)).notifications.some((n) => n.type === 'volunteer_application'));
    assert.equal((await apply(ann.token, 'again')).status, 409);
    const row = (await api('GET', '/api/volunteer/opportunities', ann.token)).body.opportunities.find((o) => o.eventId === event.id);
    assert.equal(row.applicationStatus, 'pending');
  });

  it('validates the message, the event and who may apply', async () => {
    assert.equal((await apply(ben.token, 'x'.repeat(501))).status, 422);
    assert.equal((await apply(ben.token, 'hi', 99999)).status, 404);
    assert.equal((await apply(org.token, 'hi')).status, 403);
  });

  it('lets a student withdraw a pending application, and only that', async () => {
    assert.equal((await apply(ben.token)).status, 201, 'a message is optional');
    assert.equal((await api('DELETE', `/api/events/${event.id}/volunteer-applications/mine`, ben.token)).status, 204);
    assert.equal((await api('DELETE', `/api/events/${event.id}/volunteer-applications/mine`, ben.token)).status, 404);
    assert.equal((await applications()).length, 1);
  });
});

describe('the organizer decides', () => {
  it('is organizer-only and limited to the organizer\'s own event', async () => {
    const url = `/api/events/${event.id}/volunteer-applications`;
    assert.equal((await api('GET', url, ann.token)).status, 403);
    assert.equal((await api('GET', url, org2.token)).status, 403);
    const id = (await applications())[0].id;
    assert.equal((await api('PATCH', `${url}/${id}`, ann.token, { status: 'approved' })).status, 403);
    assert.equal((await api('PATCH', `${url}/${id}`, org2.token, { status: 'approved' })).status, 403);
    assert.equal((await api('PATCH', `${url}/${id}`, org.token, { status: 'maybe' })).status, 422);
    assert.equal((await api('PATCH', `${url}/99999`, org.token, { status: 'approved' })).status, 404);
  });

  it('approving makes the student a volunteer and tells them', async () => {
    const id = (await applications())[0].id;
    const res = await api('PATCH', `/api/events/${event.id}/volunteer-applications/${id}`, org.token, { status: 'approved' });
    assert.equal(res.status, 200);
    assert.equal(res.body.application.status, 'approved');
    assert.ok((await myAssignments(ann.token)).some((a) => a.eventId === event.id && a.staffRole === 'volunteer'));
    assert.ok((await inbox(ann.token)).notifications.some((n) => n.type === 'volunteer_decision' && /approved/.test(n.message)));
    const staff = (await api('GET', `/api/events/${event.id}/staff`, org.token)).body.staff;
    assert.ok(staff.some((s) => s.userId === ann.user.id && s.staffRole === 'volunteer'));
    // A decided application cannot be decided again, and a volunteer cannot apply again.
    assert.equal((await api('PATCH', `/api/events/${event.id}/volunteer-applications/${id}`, org.token, { status: 'declined' })).status, 409);
    assert.equal((await apply(ann.token)).status, 409);
    const row = (await api('GET', '/api/volunteer/opportunities', ann.token)).body.opportunities.find((o) => o.eventId === event.id);
    assert.equal(row.isVolunteer, true);
  });

  it('declining adds no role, and the student may apply again', async () => {
    await apply(ben.token, 'please');
    const id = (await applications()).find((a) => a.name === 'Ben Singh').id;
    assert.equal((await api('PATCH', `/api/events/${event.id}/volunteer-applications/${id}`, org.token, { status: 'declined' })).status, 200);
    assert.equal((await myAssignments(ben.token)).length, 0);
    assert.ok((await inbox(ben.token)).notifications.some((n) => n.type === 'volunteer_decision'));
    assert.equal((await api('DELETE', `/api/events/${event.id}/volunteer-applications/mine`, ben.token)).status, 404, 'only pending ones can be withdrawn');
    assert.equal((await apply(ben.token, 'second try')).status, 201);
    assert.equal((await applications()).find((a) => a.name === 'Ben Singh').status, 'pending');
  });
});
