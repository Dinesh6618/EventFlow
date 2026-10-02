import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

// Student experience: saved events, filters, home dashboard, event page content, profile details, sorting.
let t;
let org;
let org2;
let sam;
let riya;
let hack;
let online;

const api = (method, url, token, json) => t.api(method, url, { token, json });

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com', { name: 'Olivia Organizer' });
  org2 = await t.signUp('organizer', 'org2@x.com');
  sam = await t.signUp('participant', 'sam@x.com', { name: 'Sam Student', department: 'Computer Science' });
  riya = await t.signUp('participant', 'riya@x.com', { name: 'Riya Rao', department: 'Mechanical' });

  hack = (
    await t.api('POST', '/api/events', {
      token: org.token,
      form: t.eventForm({
        name: 'Big Hack',
        type: 'Hackathon',
        department: 'Computer Science',
        teamEnabled: 'true',
        maxParticipants: '2',
        prizes: JSON.stringify([{ title: 'First place', description: 'Cash' }]),
        rules: JSON.stringify(['Bring your ID']),
        faqs: JSON.stringify([{ question: 'Fee?', answer: 'Free' }]),
      }),
    })
  ).body.event;
  online = await t.createEvent(org.token, { name: 'Web Talk', type: 'Seminar', mode: 'online', date: dayOffset(12), registrationDeadline: `${dayOffset(9)}T12:00` });
});
after(() => t.stop());

describe('event page content', () => {
  it('stores and returns format, department, prizes, rules and FAQs', async () => {
    const { event } = (await api('GET', `/api/events/${hack.id}`, sam.token)).body;
    assert.equal(event.mode, 'offline');
    assert.equal(event.department, 'Computer Science');
    assert.deepEqual(event.prizes, [{ title: 'First place', description: 'Cash' }]);
    assert.deepEqual(event.rules, ['Bring your ID']);
    assert.deepEqual(event.faqs, [{ question: 'Fee?', answer: 'Free' }]);
    assert.equal(event.favorite, false);
  });

  it('validates the new fields', async () => {
    const post = (extra) => t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ name: 'Bad one', ...extra }) });
    assert.equal((await post({ mode: 'hologram' })).status, 422);
    assert.equal((await post({ prizes: 'not json' })).status, 422);
    assert.equal((await post({ prizes: JSON.stringify([{ title: '' }]) })).status, 422);
    assert.equal((await post({ rules: JSON.stringify(Array(21).fill('r')) })).status, 422);
    assert.equal((await post({ faqs: JSON.stringify([{ question: 'q' }]) })).status, 422);
    assert.equal((await post({})).status, 201, 'all of them are optional');
  });
});

describe('saved events and filters', () => {
  it('lets only students save events, and only once', async () => {
    assert.equal((await api('POST', `/api/events/${hack.id}/favorite`, org.token)).status, 403);
    assert.equal((await t.api('POST', `/api/events/${hack.id}/favorite`, {})).status, 401);
    assert.equal((await api('POST', '/api/events/9999/favorite', sam.token)).status, 404);
    assert.equal((await api('POST', `/api/events/${hack.id}/favorite`, sam.token)).status, 200);
    assert.equal((await api('POST', `/api/events/${hack.id}/favorite`, sam.token)).status, 200, 'saving twice is harmless');
    const mine = (await api('GET', `/api/events/${hack.id}`, sam.token)).body.event;
    assert.equal(mine.favorite, true);
    assert.equal((await api('GET', `/api/events/${hack.id}`, riya.token)).body.event.favorite, false, 'favourites are per student');
  });

  it('filters the saved list, mode, department and availability', async () => {
    const list = async (qs, token = sam.token) => (await api('GET', `/api/events${qs}`, token)).body.events.map((e) => e.name);
    assert.deepEqual(await list('?favorites=true'), ['Big Hack']);
    assert.deepEqual(await list('?favorites=true', riya.token), []);
    assert.deepEqual(await list('?mode=online'), ['Web Talk']);
    assert.ok((await list('?department=Computer%20Science')).includes('Big Hack'));
    assert.ok(!(await list('?department=Mechanical')).includes('Big Hack'), 'a department-only event is hidden from other departments');
    assert.ok((await list('?department=Mechanical')).includes('Web Talk'), 'open events match every department');
    assert.equal((await api('GET', '/api/events?mode=hologram', sam.token)).status, 422);
  });

  it('hides full events when asked to', async () => {
    await api('POST', `/api/events/${hack.id}/registrations`, sam.token);
    await api('POST', `/api/events/${hack.id}/registrations`, riya.token);
    const names = (await api('GET', '/api/events?available=true', sam.token)).body.events.map((e) => e.name);
    assert.ok(!names.includes('Big Hack'));
    assert.ok(names.includes('Web Talk'));
  });

  it('removes a saved event', async () => {
    assert.equal((await api('DELETE', `/api/events/${hack.id}/favorite`, sam.token)).status, 200);
    assert.deepEqual((await api('GET', '/api/events?favorites=true', sam.token)).body.events, []);
  });
});

describe('student home', () => {
  it('is for students only', async () => {
    assert.equal((await api('GET', '/api/me/dashboard', org.token)).status, 403);
    assert.equal((await t.api('GET', '/api/me/dashboard', {})).status, 401);
  });

  it('counts only what the student has really done', async () => {
    const d = (await api('GET', '/api/me/dashboard', sam.token)).body;
    assert.deepEqual(d.stats, { registered: 1, upcoming: 1, certificates: 0, explored: 1 });
    assert.equal(d.next.eventName, 'Big Hack');
    // Opening an event page counts as exploring it (the hackathon was opened above, the talk now).
    await api('GET', `/api/events/${online.id}`, sam.token);
    assert.equal((await api('GET', '/api/me/dashboard', sam.token)).body.stats.explored, 2);
  });

  it('recommends open events the student has not joined, with a stated reason', async () => {
    const d = (await api('GET', '/api/me/dashboard', sam.token)).body;
    assert.ok(d.recommended.every((e) => e.id !== hack.id), 'never an event already registered for');
    const talk = d.recommended.find((e) => e.id === online.id);
    assert.ok(talk);
    assert.match(talk.reason, /Because you looked at seminar events/);
  });
});

describe('profile and participants', () => {
  it('saves year and phone, validates them, and keeps them when omitted', async () => {
    const patch = (json) => api('PATCH', '/api/auth/me', sam.token, { name: 'Sam Student', department: 'Computer Science', college: 'ABC College', ...json });
    const ok = await patch({ year: 3, phone: '+91 98765 43210' });
    assert.equal(ok.body.user.year, 3);
    assert.equal(ok.body.user.phone, '+91 98765 43210');
    assert.equal((await patch({ year: 9 })).status, 422);
    assert.equal((await patch({ phone: 'abc' })).status, 422);
    const kept = await patch({});
    assert.equal(kept.body.user.year, 3, 'omitted fields are left alone');
    const cleared = await patch({ year: '', phone: '' });
    assert.equal(cleared.body.user.year, null);
    assert.equal(cleared.body.user.phone, null);
    await patch({ year: 3 });
  });

  it('shows year, attendance and team to the organizer and sorts on the server', async () => {
    await api('POST', `/api/events/${hack.id}/teams`, sam.token, { name: 'Alpha' });
    const rows = (await api('GET', '/api/organizer/participants?sort=name&dir=desc', org.token)).body.registrations;
    assert.deepEqual(rows.map((r) => r.participantName), ['Sam Student', 'Riya Rao']);
    const samRow = rows.find((r) => r.participantName === 'Sam Student');
    assert.equal(samRow.year, 3);
    assert.equal(samRow.teamName, 'Alpha');
    assert.equal(samRow.attendanceStatus, null);
    const asc = (await api('GET', '/api/organizer/participants?sort=name', org.token)).body.registrations;
    assert.deepEqual(asc.map((r) => r.participantName), ['Riya Rao', 'Sam Student']);
    assert.equal((await api('GET', '/api/organizer/participants?sort=password', org.token)).status, 422, 'only whitelisted sort keys');
    assert.equal((await api('GET', '/api/organizer/participants', org2.token)).body.registrations.length, 0, 'other organizers see nothing');
  });
});

describe('organizer activity and public numbers', () => {
  it('lists the latest registrations for the organizer only', async () => {
    const mine = (await api('GET', '/api/organizer/activity', org.token)).body.activity;
    assert.ok(mine.length >= 2 && mine.every((a) => a.kind === 'registered' || a.kind === 'checked_in'));
    assert.deepEqual((await api('GET', '/api/organizer/activity', org2.token)).body.activity, []);
    assert.equal((await api('GET', '/api/organizer/activity', sam.token)).status, 403);
  });

  it('publishes aggregate totals without sign-in, and no satisfaction until there is feedback', async () => {
    const stats = (await t.api('GET', '/api/public/stats', {})).body;
    assert.equal(typeof stats.events, 'number');
    assert.equal(stats.participants, 2);
    assert.equal(stats.satisfaction, null);
    assert.deepEqual(Object.keys(stats).sort(), ['colleges', 'events', 'participants', 'satisfaction']);
  });
});
