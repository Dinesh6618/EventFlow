import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { config, dayOffset, query, startServer } from './helpers.js';

const { runHelpEscalation } = await import('../src/services/helpEscalation.js');

// Emergency & Help Center.
let t;
let org;
let org2;
let admin;
let ann; // participant with a seat
let cat; // another participant with a seat
let dan; // participant without a seat
let ben; // volunteer
let eve; // second volunteer
let event;
let futureEvent;
let categories;

const api = (method, url, token, json) => t.api(method, url, { token, json });
const code = (name) => categories.find((c) => c.code === name).id;
const ask = (token, name, extra = {}, eventId = event.id) =>
  api('POST', `/api/events/${eventId}/help-requests`, token, { categoryId: code(name), location: 'Seminar Hall 2', description: 'Projector is not working in Seminar Hall 2.', ...extra });
const get = (token, id) => api('GET', `/api/help-requests/${id}`, token);
const inbox = async (token) => (await api('GET', '/api/notifications?pageSize=50', token)).body.notifications;
const hasNotice = async (token, type) => (await inbox(token)).some((n) => n.type === type);
const orgList = async (query = '') => (await api('GET', `/api/organizer/events/${event.id}/help-requests${query}`, org.token)).body;
const setCreated = (id, minutesAgo) => query(`UPDATE help_requests SET created_at = NOW() - ($2 || ' minutes')::interval WHERE id = $1`, [id, String(minutesAgo)]);

// Earlier sections leave requests open; sections that make new ones start from a clean slate.
const clearOpen = () => query(`UPDATE help_requests SET status = 'cancelled', cancelled_at = NOW() WHERE status = ANY($1)`, [['reported', 'acknowledged', 'assigned', 'in_progress']]);

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const photoForm = (name, blob, filename = 'photo.png') => {
  const form = new FormData();
  form.set('categoryId', String(code(name)));
  form.set('location', 'Food Court');
  form.set('description', 'Spilled water near the stage');
  form.set('photo', blob, filename);
  return form;
};

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  admin = await t.signUp('participant', 'admin@x.com', { name: 'Admin User' });
  await query(`UPDATE users SET role = 'admin' WHERE id = $1`, [admin.user.id]);
  ann = await t.signUp('participant', 'ann@x.com', { name: 'Ann Kumar', phone: '+91 98765 43210' });
  cat = await t.signUp('participant', 'cat@x.com', { name: 'Cat Rao' });
  dan = await t.signUp('participant', 'dan@x.com', { name: 'Dan Roy' });
  ben = await t.signUp('participant', 'ben@x.com', { name: 'Ben Singh' });
  eve = await t.signUp('participant', 'eve@x.com', { name: 'Eve Das' });

  event = await t.createEvent(org.token, { name: 'Help Fest' });
  futureEvent = await t.createEvent(org.token, { name: 'Later Fest' });
  for (const person of [ann, cat]) {
    assert.equal((await api('POST', `/api/events/${event.id}/registrations`, person.token)).status, 201);
    assert.equal((await api('POST', `/api/events/${futureEvent.id}/registrations`, person.token)).status, 201);
  }
  for (const person of [ben, eve]) assert.equal((await api('POST', `/api/events/${event.id}/staff`, org.token, { email: person.user.email, role: 'volunteer' })).status, 201);
  // The event is on today; the other one stays in the future.
  await query(`UPDATE events SET date = $2::date, start_time = '00:00', end_time = '23:59' WHERE id = $1`, [event.id, dayOffset(0)]);
  categories = (await api('GET', '/api/admin/help-categories', admin.token)).body.categories;
});
after(() => t.stop());

describe('the help centre screen', () => {
  it('ships the six categories and offers them to a registered participant', async () => {
    assert.deepEqual(categories.map((c) => c.code), ['medical', 'security', 'technical', 'venue', 'lost_found', 'general']);
    const res = await api('GET', `/api/events/${event.id}/help/info`, ann.token);
    assert.equal(res.status, 200);
    assert.equal(res.body.canRequest, true);
    assert.equal(res.body.categories.length, 6);
    assert.ok(res.body.categories.find((c) => c.code === 'medical').isUrgent);
    assert.ok(res.body.locations.includes(event.venue), 'the event venue is a choice');
    assert.deepEqual(res.body.contacts, [], 'no contact numbers are invented');
  });

  it('refuses people without a seat and tells them how to get one', async () => {
    assert.equal((await api('GET', `/api/events/${event.id}/help/info`, dan.token)).status, 403);
    assert.equal((await ask(dan.token, 'technical')).status, 403);
    assert.equal((await t.api('GET', `/api/events/${event.id}/help/info`)).status, 401);
  });

  it('only opens on the day of the event', async () => {
    const info = (await api('GET', `/api/events/${futureEvent.id}/help/info`, ann.token)).body;
    assert.equal(info.canRequest, false);
    assert.match(info.reason, /day of the event/);
    assert.equal((await ask(ann.token, 'technical', {}, futureEvent.id)).status, 409);
  });
});

describe('reporting a problem', () => {
  let request;

  it('creates a request with a unique ID, a priority from its category, and status REPORTED', async () => {
    const res = await ask(ann.token, 'technical', { priority: 'low', status: 'closed' });
    assert.equal(res.status, 201);
    request = res.body.request;
    assert.match(request.requestCode, /^HELP-\d{4}-\d{6}$/);
    assert.deepEqual([request.status, request.priority, request.category.code, request.location], ['reported', 'high', 'technical', 'Seminar Hall 2']);
    assert.equal(res.body.timeline[0].message, 'Request submitted');
    assert.ok(await hasNotice(ann.token, 'help_submitted'));
    const second = await ask(ann.token, 'venue', { description: 'No chairs in Room 4' });
    assert.notEqual(second.body.request.requestCode, request.requestCode);
    assert.equal(second.body.request.priority, 'medium');
    await api('POST', `/api/help-requests/${second.body.request.id}/cancel`, ann.token);
  });

  it('validates the form field by field', async () => {
    const empty = await api('POST', `/api/events/${event.id}/help-requests`, ann.token, {});
    assert.equal(empty.status, 422);
    assert.ok(empty.body.errors.categoryId && empty.body.errors.location);
    const short = await ask(ann.token, 'general', { description: 'x' });
    assert.ok(short.body.errors.description);
    assert.equal((await ask(ann.token, 'general', { description: 'y'.repeat(1001) })).status, 422);
    assert.equal((await ask(ann.token, 'general', { categoryId: 9999 })).status, 422);
    assert.equal((await ask(ann.token, 'general', { contactPreference: 'telepathy' })).status, 422);
  });

  it('shows the participant their own requests only', async () => {
    const mine = (await api('GET', '/api/help-requests/mine', ann.token)).body.requests;
    assert.ok(mine.some((r) => r.id === request.id));
    assert.equal((await api('GET', `/api/events/${event.id}/help-requests/my`, cat.token)).body.requests.length, 0);
    assert.equal((await get(cat.token, request.id)).status, 404, 'another participant cannot read it');
    assert.equal((await get(org2.token, request.id)).status, 404, 'nor can another organizer');
    assert.equal((await t.api('GET', `/api/help-requests/${request.id}`)).status, 401);
    assert.equal((await get(ann.token, 99999)).status, 404);
  });

  it('shows the participant no phone, email or internal notes', async () => {
    const view = (await get(ann.token, request.id)).body;
    const text = JSON.stringify(view);
    assert.ok(!text.includes('98765') && !text.includes('ann@x.com'));
    assert.equal(view.request.participant, undefined);
    assert.equal(view.request.viewer, 'participant');
  });
});

describe('urgent requests need safeguards', () => {
  it('needs an explicit confirmation, and the participant cannot choose the priority', async () => {
    const without = await ask(cat.token, 'medical', { description: '' });
    assert.equal(without.status, 422);
    assert.ok(without.body.errors.confirmUrgent);
    const sent = await ask(cat.token, 'medical', { description: '', confirmUrgent: true, priority: 'low' });
    assert.equal(sent.status, 201);
    assert.equal(sent.body.request.priority, 'urgent');
    assert.equal((await ask(cat.token, 'security', { description: 'A stranger is following people', confirmUrgent: true })).body.request.priority, 'urgent');
  });

  it('alerts the organizer immediately, and shows the urgent count', async () => {
    const notices = (await inbox(org.token)).filter((n) => n.type === 'help_urgent');
    assert.ok(notices.length >= 2, 'organizer notified of each urgent request');
    assert.ok(notices.some((n) => /Medical Assistance/.test(n.message)));
    assert.ok(!/stranger/.test(JSON.stringify(await inbox(org.token))), 'notices carry no description');
    assert.ok((await orgList()).summary.urgent >= 2);
    const dashboard = (await api('GET', '/api/organizer/help-summary', org.token)).body;
    assert.ok(dashboard.summary.urgent >= 2 && dashboard.urgent.length > 0);
  });
});

describe('the organizer runs the help desk', () => {
  let target;

  before(async () => {
    target = (await orgList()).requests.find((r) => r.category.code === 'technical');
  });

  it('is limited to the organizer of that event', async () => {
    assert.equal((await api('GET', `/api/organizer/events/${event.id}/help-requests`, org2.token)).status, 403);
    assert.equal((await api('GET', `/api/organizer/events/${event.id}/help-requests`, ann.token)).status, 403);
    assert.equal((await api('GET', `/api/organizer/events/${event.id}/help-requests`, ben.token)).status, 403);
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/assign`, org2.token, { volunteerId: ben.user.id })).status, 404);
  });

  it('lists requests with participant, location, priority, status and age, urgent first', async () => {
    const list = await orgList();
    assert.ok(list.requests.length >= 3);
    assert.equal(list.requests[0].priority, 'urgent');
    assert.equal(target.participant.name, 'Ann Kumar');
    assert.equal(target.participant.phone, null, 'the phone stays hidden unless they asked to be called');
    assert.deepEqual(list.responders.map((r) => r.name), ['Ben Singh', 'Eve Das']);
    assert.equal((await orgList('?priority=urgent')).requests.every((r) => r.priority === 'urgent'), true);
    assert.equal((await orgList('?state=open')).requests.every((r) => ['reported', 'acknowledged', 'assigned'].includes(r.status)), true);
  });

  it('acknowledges, then assigns a volunteer who is notified', async () => {
    const ack = await api('PATCH', `/api/help-requests/${target.id}/status`, org.token, { status: 'acknowledged' });
    assert.equal(ack.status, 200);
    assert.equal(ack.body.request.status, 'acknowledged');
    assert.ok(await hasNotice(ann.token, 'help_acknowledged'));

    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/assign`, org.token, { volunteerId: cat.user.id })).status, 422, 'only this event\'s volunteers');
    const res = await api('PATCH', `/api/help-requests/${target.id}/assign`, org.token, { volunteerId: ben.user.id });
    assert.equal(res.status, 200);
    assert.deepEqual([res.body.request.status, res.body.request.assignedTo.name], ['assigned', 'Ben Singh']);
    assert.ok(await hasNotice(ben.token, 'help_assigned'));
    assert.ok(await hasNotice(ann.token, 'help_assigned'));
    const participantView = (await get(ann.token, target.id)).body.request;
    assert.equal(participantView.assignedTo.name, 'Ben', 'the participant sees a first name only');
  });

  it('lets the organizer change the priority, which the volunteer hears about', async () => {
    const res = await api('PATCH', `/api/help-requests/${target.id}/priority`, org.token, { priority: 'urgent', reason: 'Keynote is about to start' });
    assert.equal(res.body.request.priority, 'urgent');
    assert.ok(await hasNotice(ben.token, 'help_priority'));
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/priority`, org.token, { priority: 'extreme' })).status, 422);
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/priority`, ann.token, { priority: 'low' })).status, 403);
    const log = (await get(org.token, target.id)).body.timeline;
    assert.ok(log.some((u) => /Priority changed from high to urgent/.test(u.message)), 'recorded for the audit trail');
    assert.ok(!(await get(ann.token, target.id)).body.timeline.some((u) => /Priority changed/.test(u.message)), 'but hidden from the participant');
    await api('PATCH', `/api/help-requests/${target.id}/priority`, org.token, { priority: 'high' });
  });
});

describe('the volunteer responds', () => {
  let target;

  before(async () => {
    target = (await api('GET', '/api/volunteer/help-requests', ben.token)).body.requests[0];
  });

  it('sees only what is assigned to them', async () => {
    const mine = (await api('GET', '/api/volunteer/help-requests', ben.token)).body.requests;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].requestCode, target.requestCode);
    assert.equal((await api('GET', '/api/volunteer/help-requests', eve.token)).body.requests.length, 0);
    assert.equal((await get(eve.token, target.id)).status, 404);
    assert.equal((await get(ben.token, (await orgList()).requests.find((r) => r.category.code === 'medical').id)).status, 404);
  });

  it('shows the volunteer the participant name and request, but not an email', async () => {
    const view = (await get(ben.token, target.id)).body;
    assert.equal(view.request.participant.name, 'Ann Kumar');
    assert.ok(!JSON.stringify(view).includes('ann@x.com'));
    assert.equal(view.request.capabilities.canAccept, true);
    assert.equal(view.request.capabilities.canClose, false);
  });

  it('accepts, starts work, posts an update the participant receives, and resolves', async () => {
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/accept`, eve.token)).status, 404);
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/accept`, ben.token)).status, 200);
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/accept`, ben.token)).status, 409);

    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/status`, ben.token, { status: 'in_progress' })).body.request.status, 'in_progress');
    const note = await api('POST', `/api/help-requests/${target.id}/updates`, ben.token, { message: 'Technician is on the way.' });
    assert.equal(note.status, 201);
    assert.ok((await inbox(ann.token)).some((n) => n.type === 'help_update' && /on the way/.test(n.message)));
    await api('POST', `/api/help-requests/${target.id}/updates`, ben.token, { message: 'Ann looked unwell, check on her', internal: true });
    const seenByParticipant = (await get(ann.token, target.id)).body.timeline.map((u) => u.message).join('|');
    assert.match(seenByParticipant, /on the way/);
    assert.ok(!/unwell/.test(seenByParticipant), 'internal notes stay with the staff');

    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/status`, ben.token, { status: 'closed' })).status, 403, 'a volunteer cannot close');
    const done = await api('PATCH', `/api/help-requests/${target.id}/status`, ben.token, { status: 'resolved', message: 'Projector replaced' });
    assert.equal(done.body.request.status, 'resolved');
    assert.ok(await hasNotice(ann.token, 'help_resolved'));
    assert.ok(done.body.request.resolvedAt && done.body.request.acknowledgedAt);
  });

  it('is closed by the organizer, after which nothing moves', async () => {
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/status`, org.token, { status: 'closed' })).body.request.status, 'closed');
    assert.equal((await api('PATCH', `/api/help-requests/${target.id}/status`, org.token, { status: 'in_progress' })).status, 409);
    assert.equal((await api('POST', `/api/help-requests/${target.id}/updates`, org.token, { message: 'late' })).status, 409);
    assert.equal((await api('GET', '/api/volunteer/help-requests', ben.token)).body.requests.length, 0, 'closed work leaves the volunteer queue');
    const times = (await api('GET', `/api/organizer/events/${event.id}/help-analytics`, org.token)).body;
    assert.ok(times.averageResponseMinutes >= 0 && times.averageResolutionMinutes >= 0);
  });

  it('cannot skip the order: closing something that was never resolved is refused', async () => {
    const fresh = (await ask(ann.token, 'general', { description: 'Where is the water?' })).body.request;
    assert.equal((await api('PATCH', `/api/help-requests/${fresh.id}/status`, org.token, { status: 'closed' })).status, 409);
    assert.equal((await api('PATCH', `/api/help-requests/${fresh.id}/status`, org.token, { status: 'bogus' })).status, 422);
  });
});

describe('cancelling', () => {
  it('lets a participant cancel until work starts, and tells the volunteer', async () => {
    const one = (await ask(cat.token, 'venue', { description: 'Broken chair' })).body.request;
    await api('PATCH', `/api/help-requests/${one.id}/assign`, org.token, { volunteerId: eve.user.id });
    assert.equal((await api('POST', `/api/help-requests/${one.id}/cancel`, ann.token)).status, 404, 'not theirs');
    assert.equal((await api('POST', `/api/help-requests/${one.id}/cancel`, eve.token)).status, 403, 'the volunteer cannot cancel');
    const res = await api('POST', `/api/help-requests/${one.id}/cancel`, cat.token);
    assert.equal(res.body.request.status, 'cancelled');
    assert.ok(await hasNotice(eve.token, 'help_cancelled'));

    const two = (await ask(cat.token, 'venue', { description: 'Door is stuck' })).body.request;
    await api('PATCH', `/api/help-requests/${two.id}/assign`, org.token, { volunteerId: eve.user.id });
    await api('PATCH', `/api/help-requests/${two.id}/status`, eve.token, { status: 'in_progress' });
    assert.equal((await api('POST', `/api/help-requests/${two.id}/cancel`, cat.token)).status, 409);
    await api('PATCH', `/api/help-requests/${two.id}/status`, eve.token, { status: 'resolved' });
    await api('PATCH', `/api/help-requests/${two.id}/status`, org.token, { status: 'closed' });
  });
});

describe('escalation', () => {
  it('flags an urgent request nobody acknowledged in time, once, and tells the organizer', async () => {
    const urgent = (await ask(ann.token, 'medical', { description: '', confirmUrgent: true })).body.request;
    assert.equal((await runHelpEscalation()).escalated, 0, 'not yet overdue');
    await setCreated(urgent.id, 10);
    assert.ok((await orgList()).requests.find((r) => r.id === urgent.id).overdue, 'shown as overdue');
    assert.equal((await runHelpEscalation()).escalated, 1);
    assert.equal((await runHelpEscalation()).escalated, 0, 'only once');
    const notice = (await inbox(org.token)).find((n) => n.type === 'help_escalation');
    assert.ok(notice && /Not acknowledged within 2 minutes/.test(notice.message));
    const view = (await get(org.token, urgent.id)).body;
    assert.ok(view.request.escalated);
    assert.ok(view.timeline.some((u) => u.kind === 'escalation'));
    assert.equal(view.request.status, 'reported', 'nothing is contacted or changed automatically');
    await api('PATCH', `/api/help-requests/${urgent.id}/status`, org.token, { status: 'acknowledged' });
    await api('PATCH', `/api/help-requests/${urgent.id}/status`, org.token, { status: 'resolved' });
    await api('PATCH', `/api/help-requests/${urgent.id}/status`, org.token, { status: 'closed' });
  });

  it('does not escalate what was acknowledged, or what is only low priority', async () => {
    const acked = (await ask(ann.token, 'technical', { description: 'Wi-Fi is down' })).body.request;
    const low = (await ask(ann.token, 'general', { description: 'Is there parking?' })).body.request;
    await api('PATCH', `/api/help-requests/${acked.id}/status`, org.token, { status: 'acknowledged' });
    await setCreated(acked.id, 20);
    await setCreated(low.id, 20);
    assert.equal((await runHelpEscalation()).escalated, 0);
  });

  it('lets the organizer escalate by hand, and warns about requests left unresolved too long', async () => {
    const mid = (await ask(cat.token, 'venue', { description: 'Stage lights are flickering' })).body.request;
    const res = await api('PATCH', `/api/help-requests/${mid.id}/escalate`, org.token, { reason: 'Session starts in 5 minutes' });
    assert.deepEqual([res.body.request.priority, res.body.request.escalated], ['urgent', true]);
    assert.equal((await api('PATCH', `/api/help-requests/${mid.id}/escalate`, ann.token, {})).status, 403);

    const slow = (await ask(cat.token, 'general', { description: 'Need a charger' })).body.request;
    await api('PATCH', `/api/help-requests/${slow.id}/status`, org.token, { status: 'acknowledged' });
    await setCreated(slow.id, 300);
    const out = await runHelpEscalation();
    assert.ok(out.unresolved >= 1);
    assert.ok((await inbox(org.token)).some((n) => n.type === 'help_unresolved'));
    assert.equal((await runHelpEscalation()).unresolved, 0, 'one reminder each');
    for (const id of [mid.id, slow.id]) await api('PATCH', `/api/help-requests/${id}/status`, org.token, { status: 'resolved' });
  });
});

describe('lost and found', () => {
  it('asks for the kind of report and the item', async () => {
    const bad = await ask(ann.token, 'lost_found', { description: '' });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.lostFoundKind && bad.body.errors.itemName);
  });

  it('tracks a lost item through found, claimed and returned', async () => {
    const res = await ask(ann.token, 'lost_found', { lostFoundKind: 'lost', itemName: 'Black backpack', description: 'Has a laptop', location: 'Innovation Lab', itemWhen: `${dayOffset(0)}T10:30` });
    assert.equal(res.status, 201);
    const { request } = res.body;
    assert.deepEqual([request.itemStatus, request.details.itemName, request.details.kind], ['open', 'Black backpack', 'lost']);
    for (const itemStatus of ['found', 'claimed', 'returned']) {
      const out = await api('PATCH', `/api/help-requests/${request.id}/item-status`, org.token, { itemStatus });
      assert.equal(out.body.request.itemStatus, itemStatus);
    }
    assert.ok((await inbox(ann.token)).some((n) => n.type === 'help_update' && /returned/.test(n.message)));
    assert.equal((await api('PATCH', `/api/help-requests/${request.id}/item-status`, ann.token, { itemStatus: 'returned' })).status, 403);
    assert.equal((await api('PATCH', `/api/help-requests/${request.id}/item-status`, org.token, { itemStatus: 'lost' })).status, 422);
    const plain = (await ask(ann.token, 'general', { description: 'Question about lunch' })).body.request;
    assert.equal((await api('PATCH', `/api/help-requests/${plain.id}/item-status`, org.token, { itemStatus: 'found' })).status, 422);
  });

  it('records a found item the same way', async () => {
    const res = await ask(cat.token, 'lost_found', { lostFoundKind: 'found', itemName: 'Blue bottle', description: '', location: 'Food Court' });
    assert.equal(res.body.request.details.kind, 'found');
  });
});

describe('privacy', () => {
  before(clearOpen);

  it('shows the phone to staff only when the participant asked to be called', async () => {
    const res = await ask(ann.token, 'general', { description: 'Please call me about my badge', contactPreference: 'call' });
    assert.equal((await get(org.token, res.body.request.id)).body.request.participant.phone, '+91 98765 43210');
    assert.equal((await get(ann.token, res.body.request.id)).body.request.participant, undefined);
  });

  it('keeps photos private: a real image is stored, shown to the people involved, and nobody else', async () => {
    const made = await t.api('POST', `/api/events/${event.id}/help-requests`, { token: cat.token, form: photoForm('venue', new Blob([PNG], { type: 'image/png' })) });
    assert.equal(made.status, 201);
    const id = made.body.request.id;
    const { attachments } = (await get(cat.token, id)).body;
    assert.equal(attachments.length, 1);
    const url = `/api/help-requests/${id}/attachments/${attachments[0].id}`;

    const owner = await t.api('GET', url, { token: cat.token });
    assert.equal(owner.status, 200);
    assert.equal(owner.headers.get('content-type'), 'image/png');
    assert.match(owner.headers.get('cache-control'), /private/);
    assert.equal((await t.api('GET', url, { token: org.token })).status, 200);
    assert.equal((await t.api('GET', url, { token: ann.token })).status, 404, 'another participant');
    assert.equal((await t.api('GET', url, { token: org2.token })).status, 404, 'another organizer');
    assert.equal((await t.api('GET', url, { token: admin.token })).status, 403, 'not even the admin');
    assert.equal((await t.api('GET', url)).status, 401);
    // The stored file is not reachable through the public uploads folder.
    const stored = (await query(`SELECT stored_name FROM help_attachments WHERE request_id = $1`, [id]))[0].stored_name;
    assert.equal((await fetch(`${t.base}/uploads/${stored}`)).status, 404);
    await api('POST', `/api/help-requests/${id}/cancel`, cat.token);
  });

  it('refuses a file that is not really an image, a non-image type, and an oversized photo', async () => {
    const fake = await t.api('POST', `/api/events/${event.id}/help-requests`, { token: cat.token, form: photoForm('venue', new Blob(['<script>alert(1)</script>'], { type: 'image/png' })) });
    assert.equal(fake.status, 422);
    assert.match(fake.body.errors.photo, /not a valid/);
    const pdf = await t.api('POST', `/api/events/${event.id}/help-requests`, { token: cat.token, form: photoForm('venue', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'a.pdf') });
    assert.equal(pdf.status, 422);
    const big = await t.api('POST', `/api/events/${event.id}/help-requests`, { token: cat.token, form: photoForm('venue', new Blob([Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)])], { type: 'image/png' })) });
    assert.equal(big.status, 422);
    assert.match(big.body.errors.photo, /5 MB/);
  });
});

describe('abuse limits', () => {
  it('caps how many requests one person can have open', async () => {
    const eli = await t.signUp('participant', 'eli@x.com');
    assert.equal((await api('POST', `/api/events/${event.id}/registrations`, eli.token)).status, 201);
    for (let i = 0; i < 5; i += 1) assert.equal((await ask(eli.token, 'general', { description: `Question number ${i}` })).status, 201);
    const sixth = await ask(eli.token, 'general', { description: 'One more question' });
    assert.equal(sixth.status, 409);
    assert.match(sixth.body.message, /open requests/);
  });

  it('rate limits repeated submissions', async () => {
    const fay = await t.signUp('participant', 'fay@x.com');
    assert.equal((await api('POST', `/api/events/${event.id}/registrations`, fay.token)).status, 201);
    const limit = config.help.createLimit;
    let sent = 0;
    let last;
    for (let i = 0; i < limit + 2; i += 1) {
      last = await ask(fay.token, 'general', { description: `Spam number ${i}` });
      if (last.status !== 201) break;
      sent += 1;
      await api('POST', `/api/help-requests/${last.body.request.id}/cancel`, fay.token);
    }
    assert.equal(last.status, 429);
    assert.equal(sent, limit, 'blocked right after the allowance');
    assert.ok((await ask(cat.token, 'general', { description: 'Other people are unaffected' })).status < 429);
  });
});

describe('admin controls', () => {
  before(clearOpen);

  it('manages categories: add, edit and switch one off', async () => {
    const made = await api('POST', '/api/admin/help-categories', admin.token, { name: 'Food & Water', description: 'Meals and drinking water', icon: '🍽️', priorityLevel: 'medium' });
    assert.equal(made.status, 201);
    assert.equal(made.body.category.isActive, true);
    assert.equal((await api('POST', '/api/admin/help-categories', admin.token, { name: '' })).status, 422);
    assert.equal((await ask(ann.token, 'general', { categoryId: made.body.category.id, description: 'No water at the stall' })).status, 201);

    const edited = await api('PUT', `/api/admin/help-categories/${made.body.category.id}`, admin.token, { priorityLevel: 'high', isActive: false });
    assert.deepEqual([edited.body.category.priorityLevel, edited.body.category.isActive], ['high', false]);
    const info = (await api('GET', `/api/events/${event.id}/help/info`, cat.token)).body;
    assert.ok(!info.categories.some((c) => c.id === made.body.category.id), 'a switched-off category is not offered');
    assert.equal((await ask(cat.token, 'general', { categoryId: made.body.category.id })).status, 422);
    assert.equal((await api('PUT', '/api/admin/help-categories/99999', admin.token, { name: 'Nope' })).status, 404);
  });

  it('manages emergency contacts, which participants see once help is open', async () => {
    const contact = await api('POST', '/api/admin/emergency-contacts', admin.token, { name: 'Campus Security', department: 'Security Office', phone: '+91 44 1234 5678', availability: '24 hours', description: 'Gate 1 control room', eventId: event.id });
    assert.equal(contact.status, 201);
    assert.equal((await api('POST', '/api/admin/emergency-contacts', admin.token, { name: 'Bad', phone: 'abc' })).status, 422);
    assert.equal((await api('POST', '/api/admin/emergency-contacts', admin.token, { name: 'Ghost', phone: '12345', eventId: 99999 })).status, 422);
    const college = await api('POST', '/api/admin/emergency-contacts', admin.token, { name: 'Medical Centre', phone: '+91 44 8765 4321' });
    assert.equal(college.body.contact.eventId, null);

    const seen = (await api('GET', `/api/events/${event.id}/help/info`, ann.token)).body.contacts.map((c) => c.name);
    assert.deepEqual(seen.sort(), ['Campus Security', 'Medical Centre']);
    assert.deepEqual((await api('GET', `/api/events/${futureEvent.id}/help/info`, ann.token)).body.contacts, [], 'not before the event day');

    await api('PUT', `/api/admin/emergency-contacts/${contact.body.contact.id}`, admin.token, { isActive: false });
    assert.deepEqual((await api('GET', `/api/events/${event.id}/help/info`, ann.token)).body.contacts.map((c) => c.name), ['Medical Centre']);
    assert.equal((await api('GET', '/api/admin/emergency-contacts', admin.token)).body.contacts.length, 2);
  });

  it('manages response teams and shows a responder\'s team to the participant', async () => {
    const team = await api('POST', '/api/admin/help-teams', admin.token, { name: 'Technical Support', description: 'AV and network' });
    assert.equal(team.status, 201);
    assert.equal((await api('POST', '/api/admin/help-teams', admin.token, { name: 'Technical Support' })).status, 409);
    const joined = await api('POST', `/api/admin/help-teams/${team.body.team.id}/members`, admin.token, { email: 'ben@x.com' });
    assert.equal(joined.body.team.members[0].name, 'Ben Singh');
    assert.equal((await api('POST', `/api/admin/help-teams/${team.body.team.id}/members`, admin.token, { email: 'nobody@x.com' })).status, 422);
    assert.ok((await orgList()).responders.find((r) => r.name === 'Ben Singh').teams.includes('Technical Support'));

    const fresh = (await ask(ann.token, 'technical', { description: 'Mic is dead' })).body.request;
    await api('PATCH', `/api/help-requests/${fresh.id}/assign`, org.token, { volunteerId: ben.user.id });
    assert.equal((await get(ann.token, fresh.id)).body.request.assignedTo.team, 'Technical Support');
    const left = await api('DELETE', `/api/admin/help-teams/${team.body.team.id}/members/${ben.user.id}`, admin.token);
    assert.equal(left.body.team.members.length, 0);
  });

  it('sets the escalation timings', async () => {
    const before = (await api('GET', '/api/admin/help-settings', admin.token)).body.escalation;
    assert.deepEqual(before.ackMinutes, { urgent: 2, high: 5 });
    const saved = await api('PUT', '/api/admin/help-settings', admin.token, { ackMinutes: { urgent: 1, high: 3 }, unresolvedMinutes: { urgent: 20, high: 40, medium: 90, low: 180 } });
    assert.deepEqual(saved.body.escalation.ackMinutes, { urgent: 1, high: 3 });
    assert.equal((await api('PUT', '/api/admin/help-settings', admin.token, { ackMinutes: { urgent: 0, high: 3 }, unresolvedMinutes: { urgent: 20, high: 40, medium: 90, low: 180 } })).status, 422);
    await api('PUT', '/api/admin/help-settings', admin.token, { ackMinutes: { urgent: 2, high: 5 }, unresolvedMinutes: { urgent: 30, high: 60, medium: 120, low: 240 } });
  });

  it('reports platform-wide without exposing what people wrote', async () => {
    const res = await api('GET', '/api/admin/help-requests', admin.token);
    assert.equal(res.status, 200);
    assert.ok(res.body.summary.total > 5);
    const text = JSON.stringify(res.body.requests);
    assert.ok(!/Projector|stranger|backpack|Ann Kumar|98765|ann@x\.com/i.test(text), 'no descriptions, names or contact details');
    assert.equal(res.body.requests[0].viewer, 'admin');
    assert.equal((await get(admin.token, res.body.requests[0].id)).body.request.description, undefined);
    const stats = (await api('GET', '/api/admin/help-analytics', admin.token)).body;
    assert.ok(stats.byCategory.length > 0 && stats.byEvent.length > 0 && stats.averageResolutionMinutes !== undefined);
    assert.ok(Math.abs(stats.byCategory.reduce((n, c) => n + c.percent, 0) - 100) < 0.5);
    assert.ok(stats.volunteerWorkload.some((v) => v.name === 'Ben Singh'));
  });

  it('keeps every admin endpoint away from everyone else', async () => {
    for (const [method, url] of [['GET', '/api/admin/help-requests'], ['GET', '/api/admin/help-analytics'], ['GET', '/api/admin/help-categories'], ['GET', '/api/admin/emergency-contacts'], ['GET', '/api/admin/help-teams'], ['GET', '/api/admin/help-settings']]) {
      for (const person of [ann, org, ben]) assert.equal((await api(method, url, person.token)).status, 403, `${method} ${url}`);
      assert.equal((await t.api(method, url)).status, 401);
    }
    assert.equal((await api('POST', '/api/admin/help-categories', ann.token, { name: 'Sneaky' })).status, 403);
    assert.equal((await api('PUT', '/api/admin/emergency-contacts/1', org.token, { name: 'Sneaky' })).status, 403);
  });
});

describe('the event command centre', () => {
  before(clearOpen);

  it('counts help requests and surfaces the newest open urgent one', async () => {
    const urgent = (await ask(cat.token, 'security', { description: 'Fight near the entrance', confirmUrgent: true, location: 'Main Gate' })).body.request;
    const cc = (await api('GET', `/api/events/${event.id}/control-center`, org.token)).body;
    assert.ok(cc.help.open >= 1 && cc.help.urgent >= 1 && cc.help.inProgress >= 0);
    assert.equal(cc.help.recentAlert.requestCode, urgent.requestCode);
    assert.equal(cc.help.recentAlert.location, 'Main Gate');
    assert.ok(!JSON.stringify(cc.help).includes('Fight'), 'counts and a place, never the description');
  });
});
