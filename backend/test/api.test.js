import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

// Isolated embedded database so tests never touch development data.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-test-'));
process.env.DATABASE_URL = '';

const { createApp } = await import('../src/app.js');
const { closeDb, initSchema } = await import('../src/db.js');
const { config } = await import('../src/config.js');

const pad = (n) => String(n).padStart(2, '0');
const future = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

let server;
let base;
const uploaded = [];

async function api(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}${url}`, { method, headers, body: json ? JSON.stringify(json) : form });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const register = (role, email) =>
  api('POST', '/api/auth/register', { json: { name: `${role} user`, email, password: 'Password123', role } });

function eventForm(overrides = {}, image) {
  const fields = {
    name: 'Test Hackathon',
    description: 'A description that is long enough.',
    type: 'Hackathon',
    date: future(10),
    startTime: '09:00',
    endTime: '17:00',
    venue: 'Main Hall',
    maxParticipants: '50',
    registrationDeadline: `${future(8)}T12:00`,
    organizerName: 'Test Organizer',
    organizerContact: 'org@college.edu',
    ...overrides,
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.append(key, value);
  if (image) form.append('image', image, 'banner.png');
  return form;
}

before(async () => {
  await initSchema();
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDb();
  for (const file of uploaded) fs.rmSync(path.join(config.uploadDir, file), { force: true });
  fs.rmSync(process.env.PGLITE_DIR, { recursive: true, force: true });
});

describe('authentication', () => {
  it('registers, rejects duplicates and never returns the password', async () => {
    const res = await register('organizer', 'Org@Example.com');
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'org@example.com');
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.token);

    assert.equal((await register('organizer', 'org@example.com')).status, 409);
  });

  it('validates registration input and blocks self-registering as admin', async () => {
    const bad = await api('POST', '/api/auth/register', {
      json: { name: 'x', email: 'nope', password: 'short', role: 'admin' },
    });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.name && bad.body.errors.email && bad.body.errors.password && bad.body.errors.role);
  });

  it('logs in with the right password only', async () => {
    assert.equal((await api('POST', '/api/auth/login', { json: { email: 'org@example.com', password: 'Password123' } })).status, 200);
    assert.equal((await api('POST', '/api/auth/login', { json: { email: 'org@example.com', password: 'wrongpass1' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { json: { email: 'ghost@example.com', password: 'Password123' } })).status, 401);
  });

  it('requires a token for protected routes', async () => {
    assert.equal((await api('GET', '/api/events')).status, 401);
    assert.equal((await api('GET', '/api/auth/me', { token: 'garbage' })).status, 401);
  });
});

describe('events', () => {
  let organizer;
  let participant;

  before(async () => {
    organizer = (await api('POST', '/api/auth/login', { json: { email: 'org@example.com', password: 'Password123' } })).body.token;
    participant = (await register('participant', 'part@example.com')).body.token;
  });

  it('lets an organizer create an event with a banner and lists it under My Events', async () => {
    const png = new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')], { type: 'image/png' });
    const created = await api('POST', '/api/events', { token: organizer, form: eventForm({}, png) });
    assert.equal(created.status, 201);
    assert.match(created.body.event.image, /^\/uploads\/[\w-]+\.png$/);
    uploaded.push(path.basename(created.body.event.image));
    assert.equal(created.body.event.availableSeats, 50);
    assert.equal(created.body.event.status, 'upcoming');
    assert.equal(created.body.event.registrationOpen, true);

    const image = await fetch(`${base}${created.body.event.image}`);
    assert.equal(image.status, 200);

    const mine = await api('GET', '/api/events/mine', { token: organizer });
    assert.equal(mine.body.events.length, 1);

    const stats = await api('GET', '/api/organizer/stats', { token: organizer });
    assert.deepEqual(stats.body.stats, { totalEvents: 1, upcomingEvents: 1, activeEvents: 1, totalParticipants: 0 });
  });

  it('rejects invalid events field by field and keeps no uploaded file', async () => {
    const before = fs.readdirSync(config.uploadDir).length;
    const png = new Blob([Buffer.from('x')], { type: 'image/png' });
    const res = await api('POST', '/api/events', {
      token: organizer,
      form: eventForm(
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
    const late = await api('POST', '/api/events', {
      token: organizer,
      form: eventForm({ registrationDeadline: `${future(11)}T10:00` }),
    });
    assert.equal(late.status, 422);
    assert.ok(late.body.errors.registrationDeadline);

    const notImage = await api('POST', '/api/events', {
      token: organizer,
      form: eventForm({}, new Blob(['hello'], { type: 'text/plain' })),
    });
    assert.equal(notImage.status, 422);
    assert.ok(notImage.body.errors.image);
  });

  it('forbids participants from creating events or reading organizer data', async () => {
    assert.equal((await api('POST', '/api/events', { token: participant, form: eventForm() })).status, 403);
    assert.equal((await api('GET', '/api/events/mine', { token: participant })).status, 403);
    assert.equal((await api('GET', '/api/organizer/stats', { token: participant })).status, 403);
    assert.equal((await api('GET', '/api/admin/stats', { token: organizer })).status, 403);
  });

  it('lets participants browse, search, filter and open details', async () => {
    await api('POST', '/api/events', {
      token: organizer,
      form: eventForm({ name: 'Pottery Workshop', type: 'Workshop', date: future(20), registrationDeadline: `${future(18)}T12:00` }),
    });

    const all = await api('GET', '/api/events', { token: participant });
    assert.deepEqual(all.body.events.map((e) => e.name), ['Test Hackathon', 'Pottery Workshop']);

    assert.deepEqual((await api('GET', '/api/events?q=pottery', { token: participant })).body.events.map((e) => e.name), ['Pottery Workshop']);
    assert.deepEqual((await api('GET', '/api/events?type=Hackathon', { token: participant })).body.events.map((e) => e.name), ['Test Hackathon']);
    assert.deepEqual((await api('GET', `/api/events?date=${future(20)}`, { token: participant })).body.events.map((e) => e.name), ['Pottery Workshop']);
    assert.equal((await api('GET', '/api/events?q=%25', { token: participant })).body.events.length, 0);
    assert.equal((await api('GET', '/api/events?type=Party', { token: participant })).status, 422);

    const id = all.body.events[0].id;
    const detail = await api('GET', `/api/events/${id}`, { token: participant });
    assert.equal(detail.body.event.organizerContact, 'org@college.edu');
    assert.equal((await api('GET', '/api/events/99999', { token: participant })).status, 404);
    assert.equal((await api('GET', '/api/events/abc', { token: participant })).status, 404);
  });
});
