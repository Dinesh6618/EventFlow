import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { config, dayOffset, startServer } from './helpers.js';

// Phase 1: authentication, role access, event creation and browsing.
let t;
const login = (email) => t.api('POST', '/api/auth/login', { json: { email, password: 'Password123' } });

before(async () => {
  t = await startServer();
});
after(() => t.stop());

describe('authentication', () => {
  it('registers, rejects duplicates and never returns the password', async () => {
    const res = await t.api('POST', '/api/auth/register', {
      json: { name: 'Org', email: 'Org@Example.com', password: 'Password123', role: 'organizer' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'org@example.com');
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.token);

    const again = await t.api('POST', '/api/auth/register', {
      json: { name: 'Org', email: 'org@example.com', password: 'Password123', role: 'organizer' },
    });
    assert.equal(again.status, 409);
  });

  it('validates registration input and blocks self-registering as admin', async () => {
    const bad = await t.api('POST', '/api/auth/register', {
      json: { name: 'x', email: 'nope', password: 'short', role: 'admin' },
    });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.name && bad.body.errors.email && bad.body.errors.password && bad.body.errors.role);
  });

  it('requires department and college for participants only', async () => {
    const missing = await t.api('POST', '/api/auth/register', {
      json: { name: 'Sam', email: 'sam@example.com', password: 'Password123', role: 'participant' },
    });
    assert.equal(missing.status, 422);
    assert.ok(missing.body.errors.department && missing.body.errors.college);

    const ok = await t.signUp('participant', 'sam@example.com');
    assert.equal(ok.user.department, 'CSE');
  });

  it('logs in with the right password only', async () => {
    assert.equal((await login('org@example.com')).status, 200);
    const wrong = await t.api('POST', '/api/auth/login', { json: { email: 'org@example.com', password: 'wrongpass1' } });
    assert.equal(wrong.status, 401);
    assert.equal((await login('ghost@example.com')).status, 401);
  });

  it('requires a token for protected routes', async () => {
    assert.equal((await t.api('GET', '/api/events')).status, 401);
    assert.equal((await t.api('GET', '/api/auth/me', { token: 'garbage' })).status, 401);
  });

  it('updates the profile', async () => {
    const { token } = (await login('sam@example.com')).body;
    const res = await t.api('PATCH', '/api/auth/me', {
      token,
      json: { name: 'Sam Updated', department: 'ECE', college: 'XYZ' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.user.department, 'ECE');
  });
});

describe('events', () => {
  let organizer;
  let participant;

  before(async () => {
    organizer = (await login('org@example.com')).body.token;
    participant = (await login('sam@example.com')).body.token;
  });

  it('lets an organizer create an event with a banner and lists it under My Events', async () => {
    const png = new Blob(
      [Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')],
      { type: 'image/png' },
    );
    const created = await t.api('POST', '/api/events', { token: organizer, form: t.eventForm({}, png) });
    assert.equal(created.status, 201);
    assert.match(created.body.event.image, /^\/uploads\/[\w-]+\.png$/);
    t.uploaded.push(path.basename(created.body.event.image));
    assert.equal(created.body.event.availableSeats, 50);
    assert.equal(created.body.event.status, 'upcoming');
    assert.equal(created.body.event.registrationOpen, true);

    assert.equal((await fetch(`${t.base}${created.body.event.image}`)).status, 200);

    const mine = await t.api('GET', '/api/events/mine', { token: organizer });
    assert.equal(mine.body.events.length, 1);

    const stats = await t.api('GET', '/api/organizer/stats', { token: organizer });
    assert.deepEqual(stats.body.stats, { totalEvents: 1, upcomingEvents: 1, activeEvents: 1, totalParticipants: 0 });
  });

  it('rejects invalid events field by field and keeps no uploaded file', async () => {
    const before = fs.readdirSync(config.uploadDir).length;
    const png = new Blob([Buffer.from('x')], { type: 'image/png' });
    const res = await t.api('POST', '/api/events', {
      token: organizer,
      form: t.eventForm(
        { name: '', type: 'Party', date: '2020-01-01', endTime: '08:00', maxParticipants: '0', organizerContact: 'bad contact!' },
        png,
      ),
    });
    assert.equal(res.status, 422);
    for (const field of ['name', 'type', 'date', 'endTime', 'maxParticipants', 'organizerContact']) {
      assert.ok(res.body.errors[field], `expected an error for ${field}`);
    }
    assert.equal(fs.readdirSync(config.uploadDir).length, before);
  });

  it('rejects a deadline after the event start and non-image uploads', async () => {
    const late = await t.api('POST', '/api/events', {
      token: organizer,
      form: t.eventForm({ registrationDeadline: `${dayOffset(11)}T10:00` }),
    });
    assert.equal(late.status, 422);
    assert.ok(late.body.errors.registrationDeadline);

    const notImage = await t.api('POST', '/api/events', {
      token: organizer,
      form: t.eventForm({}, new Blob(['hello'], { type: 'text/plain' })),
    });
    assert.equal(notImage.status, 422);
    assert.ok(notImage.body.errors.image);
  });

  it('forbids participants from creating events or reading organizer data', async () => {
    assert.equal((await t.api('POST', '/api/events', { token: participant, form: t.eventForm() })).status, 403);
    assert.equal((await t.api('GET', '/api/events/mine', { token: participant })).status, 403);
    assert.equal((await t.api('GET', '/api/organizer/stats', { token: participant })).status, 403);
    assert.equal((await t.api('GET', '/api/admin/stats', { token: organizer })).status, 403);
  });

  it('lets participants browse, search, filter and open details', async () => {
    await t.createEvent(organizer, {
      name: 'Pottery Workshop',
      type: 'Workshop',
      date: dayOffset(20),
      registrationDeadline: `${dayOffset(18)}T12:00`,
    });

    const all = await t.api('GET', '/api/events', { token: participant });
    assert.deepEqual(all.body.events.map((e) => e.name), ['Test Hackathon', 'Pottery Workshop']);

    const names = async (qs) => (await t.api('GET', `/api/events?${qs}`, { token: participant })).body.events.map((e) => e.name);
    assert.deepEqual(await names('q=pottery'), ['Pottery Workshop']);
    assert.deepEqual(await names('type=Hackathon'), ['Test Hackathon']);
    assert.deepEqual(await names(`date=${dayOffset(20)}`), ['Pottery Workshop']);
    assert.equal((await names('q=%25')).length, 0);
    assert.equal((await t.api('GET', '/api/events?type=Party', { token: participant })).status, 422);

    const id = all.body.events[0].id;
    const detail = await t.api('GET', `/api/events/${id}`, { token: participant });
    assert.equal(detail.body.event.organizerContact, 'org@college.edu');
    assert.equal(detail.body.registration, null);
    assert.equal((await t.api('GET', '/api/events/99999', { token: participant })).status, 404);
    assert.equal((await t.api('GET', '/api/events/abc', { token: participant })).status, 404);
  });
});
