import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Isolated embedded database per test file so tests never touch development data.
// Must be set before the app modules are imported.
process.env.PGLITE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eventflow-test-'));
process.env.DATABASE_URL = '';

const { createApp } = await import('../src/app.js');
const { closeDb, initSchema, query } = await import('../src/db.js');
const { config } = await import('../src/config.js');

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' for today + days. */
export function dayOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export { query, config };

export async function startServer() {
  await initSchema();
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  const uploaded = [];

  async function api(method, url, { token, json, form } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (json) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${url}`, { method, headers, body: json ? JSON.stringify(json) : form });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, body, headers: res.headers };
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await closeDb();
    for (const file of uploaded) fs.rmSync(path.join(config.uploadDir, file), { force: true });
    fs.rmSync(process.env.PGLITE_DIR, { recursive: true, force: true });
  }

  /** Create an account and return { token, user }. */
  async function signUp(role, email, extra = {}) {
    const res = await api('POST', '/api/auth/register', {
      json: {
        name: extra.name || `${role} ${email.split('@')[0]}`,
        email,
        password: 'Password123',
        role,
        ...(role === 'participant' ? { department: 'CSE', college: 'ABC College' } : {}),
        ...extra,
      },
    });
    if (res.status !== 201) throw new Error(`signUp failed: ${JSON.stringify(res.body)}`);
    return { token: res.body.token, user: res.body.user };
  }

  /** Build the multipart body for POST /api/events. */
  function eventForm(overrides = {}, image) {
    const fields = {
      name: 'Test Hackathon',
      description: 'A description that is long enough.',
      type: 'Hackathon',
      date: dayOffset(10),
      startTime: '09:00',
      endTime: '17:00',
      venue: 'Main Hall',
      maxParticipants: '50',
      registrationDeadline: `${dayOffset(8)}T12:00`,
      organizerName: 'Test Organizer',
      organizerContact: 'org@college.edu',
      ...overrides,
    };
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) if (value !== undefined) form.append(key, value);
    if (image) form.append('image', image, 'banner.png');
    return form;
  }

  async function createEvent(token, overrides = {}) {
    const res = await api('POST', '/api/events', { token, form: eventForm(overrides) });
    if (res.status !== 201) throw new Error(`createEvent failed: ${JSON.stringify(res.body)}`);
    return res.body.event;
  }

  return { api, base, stop, signUp, eventForm, createEvent, uploaded };
}
