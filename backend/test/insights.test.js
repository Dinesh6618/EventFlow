import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

const { setAnthropicClient } = await import('../src/services/ai/anthropic.js');

// Phase 10: rule-based recommendations, AI suggestions, crowd zones and the control center.
let t;
let org;
let org2;
let volunteer;
let outsider;
let alice;
let bob;
let event;

const calls = [];
let queue = [];
const fakeClient = {
  messages: {
    stream(params) {
      calls.push(params);
      return {
        async finalMessage() {
          const next = queue.shift();
          if (!next) throw new Error('no scripted AI response left');
          return { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, ...next };
        },
      };
    },
  },
};
const reply = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] });
const idea = (title, extra = {}) => ({ category: 'registration', title, message: `${title} - explained for the organizer.`, suggestion: 'Consider doing this.', basis: 'registered 2 of 50', ...extra });

const api = (method, url, token, json) => t.api(method, url, { token, json });
const recs = async (token = org.token, eventId = event.id) => (await api('GET', `/api/events/${eventId}/recommendations`, token)).body.recommendations;
const byKey = (list, key) => list.find((r) => r.ruleKey === key);
const center = async (eventId = event.id) => (await api('GET', `/api/events/${eventId}/control-center`, org.token)).body;
const setDeadline = (daysAhead, eventId = event.id) =>
  query(`UPDATE events SET registration_deadline = NOW() + ($2 || ' days')::interval WHERE id = $1`, [eventId, String(daysAhead)]);

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  volunteer = await t.signUp('participant', 'vol@x.com', { name: 'Vera Volunteer' });
  outsider = await t.signUp('participant', 'out@x.com', { name: 'Olga Outsider' });
  alice = await t.signUp('participant', 'alice@x.com', { name: 'Alice Kumar' });
  bob = await t.signUp('participant', 'bob@x.com', { name: 'Bob Singh' });

  event = await t.createEvent(org.token, { name: 'Insight Day', maxParticipants: '50', requiresApproval: 'true' });
  await api('POST', `/api/events/${event.id}/registrations`, alice.token);
  await api('POST', `/api/events/${event.id}/registrations`, bob.token);
  await api('POST', `/api/events/${event.id}/staff`, org.token, { email: 'vol@x.com', role: 'volunteer' });
});
after(() => {
  setAnthropicClient(null);
  return t.stop();
});

describe('access', () => {
  it('keeps recommendations and the control center to the owning organizer', async () => {
    for (const path of ['recommendations', 'control-center']) {
      const url = `/api/events/${event.id}/${path}`;
      assert.equal((await t.api('GET', url, {})).status, 401);
      assert.equal((await api('GET', url, alice.token)).status, 403);
      assert.equal((await api('GET', url, volunteer.token)).status, 403, 'volunteers only see crowd zones');
      assert.equal((await api('GET', url, org2.token)).status, 403);
      assert.equal((await api('GET', url, org.token)).status, 200);
    }
    assert.equal((await api('GET', '/api/events/99999/recommendations', org.token)).status, 404);
  });
});

describe('rule-based recommendations', () => {
  it('stays quiet while the numbers are healthy', async () => {
    await setDeadline(8);
    const list = await recs();
    assert.equal(byKey(list, 'registration-low-fill'), undefined);
  });

  it('produces recommendations from real data, with evidence and a link', async () => {
    await setDeadline(1);
    const list = await recs();
    const low = byKey(list, 'registration-low-fill');
    assert.ok(low, 'low registrations with a close deadline');
    assert.equal(low.source, 'rules');
    assert.equal(low.severity, 'important');
    assert.equal(low.status, 'new');
    assert.match(low.title, /4% of capacity/);
    assert.deepEqual(low.evidence[0], { label: 'Registered', value: '2 of 50' });
    assert.equal(low.link, `/organizer/events/${event.id}/announcements`);

    const backlog = byKey(list, 'registration-pending-backlog');
    assert.match(backlog.title, /^2 registrations waiting for approval/);
  });

  it('does not duplicate rows when checked again', async () => {
    const first = (await recs()).length;
    assert.equal((await recs()).length, first);
  });

  it('remembers dismissed and done while the situation lasts, and resets when it comes back', async () => {
    const low = byKey(await recs(), 'registration-low-fill');
    const dismissed = await api('PATCH', `/api/events/${event.id}/recommendations/${low.id}`, org.token, { status: 'dismissed' });
    assert.equal(dismissed.body.recommendation.status, 'dismissed');
    assert.equal(byKey(await recs(), 'registration-low-fill').status, 'dismissed', 'still dismissed after re-evaluating');

    const done = await api('PATCH', `/api/events/${event.id}/recommendations/${low.id}`, org.token, { status: 'done' });
    assert.equal(done.body.recommendation.status, 'done');
    const reopened = await api('PATCH', `/api/events/${event.id}/recommendations/${low.id}`, org.token, { status: 'new' });
    assert.equal(reopened.body.recommendation.status, 'new');

    // The deadline moves away, so the situation no longer applies and the item resolves itself.
    await setDeadline(20);
    const resolved = byKey(await recs(), 'registration-low-fill');
    assert.equal(resolved.status, 'resolved');
    assert.ok(resolved.resolvedAt);
    assert.equal((await api('PATCH', `/api/events/${event.id}/recommendations/${low.id}`, org.token, { status: 'done' })).status, 409);

    // If it happens again it comes back as new.
    await setDeadline(1);
    const back = byKey(await recs(), 'registration-low-fill');
    assert.equal(back.status, 'new');
    assert.equal(back.resolvedAt, null);
    assert.equal(back.id, low.id);
  });

  it('shows current items before dismissed or resolved ones', async () => {
    const low = byKey(await recs(), 'registration-low-fill');
    await api('PATCH', `/api/events/${event.id}/recommendations/${low.id}`, org.token, { status: 'dismissed' });
    const list = await recs();
    const statuses = list.map((r) => r.status);
    assert.deepEqual(statuses, [...statuses].sort((a, b) => (b === 'new') - (a === 'new')));
  });

  it('validates updates and keeps events apart', async () => {
    const low = byKey(await recs(), 'registration-low-fill');
    const patch = (token, id, body, eventId = event.id) => api('PATCH', `/api/events/${eventId}/recommendations/${id}`, token, body);
    const bad = await patch(org.token, low.id, { status: 'deleted' });
    assert.equal(bad.status, 422);
    assert.equal((await patch(org.token, low.id, {})).status, 422);
    assert.equal((await patch(org.token, 99999, { status: 'done' })).status, 404);
    assert.equal((await patch(org.token, 'abc', { status: 'done' })).status, 404);
    assert.equal((await patch(org2.token, low.id, { status: 'done' })).status, 403);
    assert.equal((await patch(alice.token, low.id, { status: 'done' })).status, 403);

    const other = await t.createEvent(org.token, { name: 'Other Day' });
    assert.equal((await patch(org.token, low.id, { status: 'done' }, other.id)).status, 404, 'an id from another event is not found');
  });
});

describe('AI suggestions', () => {
  const ask = (token = org.token, eventId = event.id) => api('POST', `/api/events/${eventId}/recommendations/ai`, token);

  it('says plainly when the AI is not configured, and reports availability', async () => {
    const res = await ask();
    assert.equal(res.status, 503);
    assert.match(res.body.message, /not set up/);
    assert.equal((await api('GET', `/api/events/${event.id}/recommendations`, org.token)).body.ai.configured, false);
  });

  it('is organizer-only', async () => {
    setAnthropicClient(fakeClient);
    assert.equal((await ask(alice.token)).status, 403);
    assert.equal((await ask(org2.token)).status, 403);
    assert.equal((await t.api('POST', `/api/events/${event.id}/recommendations/ai`, {})).status, 401);
    assert.equal(calls.length, 0, 'the model is never called for people who may not ask');
  });

  it('stores validated ideas as AI suggestions and sends no personal data', async () => {
    queue = [reply({ recommendations: [idea('Open a waitlist for late sign-ups'), idea('Ask departments to share the event', { category: 'general' })] })];
    const res = await ask();
    assert.equal(res.status, 200);
    assert.equal(res.body.added, 2);
    const ai = res.body.recommendations.filter((r) => r.source === 'ai');
    assert.equal(ai.length, 2);
    assert.ok(ai.every((r) => r.severity === 'suggestion' && r.status === 'new' && r.evidence[0].label === 'Based on'));

    const sent = JSON.stringify(calls.at(-1));
    for (const secret of ['alice@x.com', 'Alice', 'Kumar', 'bob@x.com', 'Bob Singh', 'Vera', 'org@x.com', 'qr_token']) {
      assert.ok(!sent.includes(secret), `the prompt must not contain ${secret}`);
    }
    assert.match(sent, /Insight Day|registered/, 'but it does carry the aggregate numbers');
    assert.match(calls.at(-1).system, /Never invent/);
    assert.equal(calls.at(-1).output_config.format.type, 'json_schema');
  });

  it('does not add the same idea twice', async () => {
    queue = [reply({ recommendations: [idea('Open a waitlist for late sign-ups')] })];
    assert.equal((await ask()).body.added, 0);
  });

  it('keeps AI ideas through re-evaluation (rules only resolve rule findings)', async () => {
    const ai = (await recs()).filter((r) => r.source === 'ai');
    assert.equal(ai.length, 2);
    assert.ok(ai.every((r) => r.status === 'new'));
  });

  it('tells the model what is already shown so it does not repeat it', async () => {
    queue = [reply({ recommendations: [] })];
    await ask();
    const prompt = calls.at(-1).messages[0].content;
    assert.match(prompt, /Already shown to the organizer/);
    assert.match(prompt, /Open a waitlist for late sign-ups/);
    assert.match(prompt, /waiting for approval/);
  });

  it('retries once on a malformed answer, and refuses to store anything that never validates', async () => {
    const before = (await recs()).length;
    queue = [reply({ recommendations: [{ title: 'x' }] }), reply({ recommendations: [idea('Recovered after one retry')] })];
    const ok = await ask();
    assert.equal(ok.body.added, 1);

    queue = [reply({ nope: true }), reply('not json at all')];
    const bad = await ask();
    assert.ok([502].includes(bad.status));
    assert.equal((await recs()).length, before + 1, 'nothing was stored from the failed attempt');

    queue = [reply({ recommendations: [idea('a'), idea('b'), idea('c'), idea('d'), idea('e'), idea('f')].map((i, n) => ({ ...i, title: `Idea number ${n}` })) }), reply({ recommendations: [] })];
    const tooMany = await ask();
    assert.equal(tooMany.body.added, 0, 'more than five fails validation, the retry returns nothing');
  });

  it('translates refusals and model errors into clean messages', async () => {
    queue = [{ stop_reason: 'refusal', content: [] }];
    assert.equal((await ask()).status, 422);
    queue = [{ stop_reason: 'max_tokens', content: [] }];
    assert.equal((await ask()).status, 502);
  });

  it('shares the hourly allowance with the other AI features', async () => {
    const org3 = await t.signUp('organizer', 'org3@x.com');
    const mine = await t.createEvent(org3.token, { name: 'Limit Day' });
    queue = Array.from({ length: 25 }, () => reply({ recommendations: [] }));
    let last;
    for (let i = 0; i < 20; i += 1) last = await ask(org3.token, mine.id);
    assert.equal(last.status, 200);
    const blocked = await ask(org3.token, mine.id);
    assert.equal(blocked.status, 429);
  });
});

describe('crowd zones', () => {
  let zone;
  const zones = (token) => api('GET', `/api/events/${event.id}/zones`, token);

  it('lets only the organizer create and remove zones, validating names', async () => {
    assert.equal((await api('POST', `/api/events/${event.id}/zones`, volunteer.token, { name: 'Gate' })).status, 403);
    assert.equal((await api('POST', `/api/events/${event.id}/zones`, org2.token, { name: 'Gate' })).status, 403);
    assert.equal((await api('POST', `/api/events/${event.id}/zones`, org.token, { name: ' ' })).status, 422);
    assert.equal((await api('POST', `/api/events/${event.id}/zones`, org.token, { name: 'x'.repeat(61) })).status, 422);
    const created = await api('POST', `/api/events/${event.id}/zones`, org.token, { name: '  Main Gate ' });
    assert.equal(created.status, 201);
    zone = created.body.zone;
    assert.equal(zone.name, 'Main Gate');
    assert.equal(zone.status, 'normal');
    assert.equal(zone.reportedAt, null);
    assert.equal(zone.reportedBy, null);
    assert.equal((await api('POST', `/api/events/${event.id}/zones`, org.token, { name: 'main gate' })).status, 409, 'names are unique ignoring case');
    await api('POST', `/api/events/${event.id}/zones`, org.token, { name: 'Food Court' });
  });

  it('lets the organizer and assigned volunteers list zones, but nobody else', async () => {
    assert.equal((await zones(org.token)).body.zones.length, 2);
    assert.equal((await zones(volunteer.token)).body.zones.length, 2);
    assert.equal((await zones(outsider.token)).status, 403);
    assert.equal((await zones(alice.token)).status, 403, 'registered participants do not see operations data');
    assert.equal((await zones(org2.token)).status, 403);
    assert.equal((await t.api('GET', `/api/events/${event.id}/zones`, {})).status, 401);
  });

  it('records who reported what and when', async () => {
    const res = await api('PATCH', `/api/events/${event.id}/zones/${zone.id}`, volunteer.token, { status: 'high_queue', note: '  Long line at the QR desk ' });
    assert.equal(res.status, 200);
    assert.equal(res.body.zone.status, 'high_queue');
    assert.equal(res.body.zone.note, 'Long line at the QR desk');
    assert.equal(res.body.zone.reportedBy, 'Vera Volunteer');
    assert.ok(res.body.zone.reportedAt);

    const byOrganizer = await api('PATCH', `/api/events/${event.id}/zones/${zone.id}`, org.token, { status: 'busy' });
    assert.equal(byOrganizer.body.zone.reportedBy, 'organizer org');
    assert.equal(byOrganizer.body.zone.note, '', 'a new report replaces the old note');
  });

  it('rejects bad reports and strangers', async () => {
    const patch = (token, body, id = zone.id, eventId = event.id) => api('PATCH', `/api/events/${eventId}/zones/${id}`, token, body);
    assert.equal((await patch(volunteer.token, { status: 'packed' })).status, 422);
    assert.equal((await patch(volunteer.token, {})).status, 422);
    assert.equal((await patch(volunteer.token, { status: 'busy', note: 'n'.repeat(201) })).status, 422);
    assert.equal((await patch(outsider.token, { status: 'busy' })).status, 403);
    assert.equal((await patch(org2.token, { status: 'busy' })).status, 403);
    assert.equal((await patch(volunteer.token, { status: 'busy' }, 99999)).status, 404);

    const other = await t.createEvent(org.token, { name: 'Elsewhere' });
    assert.equal((await patch(org.token, { status: 'busy' }, zone.id, other.id)).status, 404, 'a zone of another event cannot be edited through this one');
    assert.equal((await api('DELETE', `/api/events/${other.id}/zones/${zone.id}`, org.token)).status, 404);
  });

  it('only lets the organizer remove a zone', async () => {
    assert.equal((await api('DELETE', `/api/events/${event.id}/zones/${zone.id}`, volunteer.token)).status, 403);
    const list = (await zones(org.token)).body.zones;
    const food = list.find((z) => z.name === 'Food Court');
    assert.equal((await api('DELETE', `/api/events/${event.id}/zones/${food.id}`, org.token)).status, 204);
    assert.equal((await api('DELETE', `/api/events/${event.id}/zones/${food.id}`, org.token)).status, 404);
    assert.equal((await zones(org.token)).body.zones.length, 1);
  });
});

describe('control center', () => {
  let aliceCode;

  it('describes an upcoming event from real numbers', async () => {
    await setDeadline(1);
    const c = await center();
    assert.equal(c.event.name, 'Insight Day');
    assert.equal(c.phase.key, 'registration');
    assert.equal(c.participants.registered, 2);
    assert.equal(c.participants.pending, 2);
    assert.equal(c.participants.capacity, 50);
    assert.equal(c.participants.checkedIn, 0);
    assert.equal(c.participants.expected, 0, 'pending registrations are not expected to attend yet');
    assert.equal(c.operations.volunteers, 1);
    assert.equal(c.sessions.current.length, 0);
    assert.equal(c.sessions.next, null);
    assert.deepEqual(c.activity, []);
    assert.equal(c.teams.enabled, false);
    assert.equal(c.teams.withoutTeam, null);
    assert.ok(c.alerts.some((a) => a.key === 'registration-low-fill'), 'important findings surface as alerts');
    assert.ok(c.alerts.length <= 4);
    assert.ok(!JSON.stringify(c).includes('@'), 'no email addresses in the twin');
  });

  it('follows the event live: approvals, check-ins, sessions and zone reports', async () => {
    const list = (await api('GET', '/api/organizer/participants', org.token)).body.registrations;
    for (const r of list) await api('PATCH', `/api/registrations/${r.id}/status`, org.token, { status: 'approved' });
    aliceCode = `EF1:${(await api('GET', '/api/registrations/mine', alice.token)).body.registrations[0].qrToken}`;

    // Make the event run right now: today, started an hour ago, ending in three hours.
    await query(
      `UPDATE events SET date = CURRENT_DATE, start_time = (LOCALTIME - INTERVAL '1 hour')::time(0), end_time = (LOCALTIME + INTERVAL '3 hours')::time(0) WHERE id = $1`,
      [event.id],
    );
    const midnightSafe = (await query(`SELECT (LOCALTIME - INTERVAL '1 hour')::time < LOCALTIME AS ok, (LOCALTIME + INTERVAL '3 hours')::time > LOCALTIME AS ok2`))[0];
    if (!midnightSafe.ok || !midnightSafe.ok2) return; // too close to midnight for a same-day window

    const scan = await t.api('POST', `/api/events/${event.id}/attendance/scan`, { token: volunteer.token, json: { code: aliceCode, action: 'check_in' } });
    assert.equal(scan.status, 200);

    const c = await center();
    assert.equal(c.phase.key, 'live');
    assert.equal(c.participants.expected, 2);
    assert.equal(c.participants.checkedIn, 1);
    assert.equal(c.participants.inside, 1);
    assert.equal(c.participants.attendanceRate, 50);
    assert.equal(c.operations.checkInsLast10Minutes, 1);
    assert.ok(c.operations.lastCheckInAt);
    assert.deepEqual(c.activity.map((a) => [a.name, a.action]), [['Alice Kumar', 'checked in']]);
  });

  it('marks zone reports with their age and flags old ones as stale', async () => {
    const before = (await center()).operations.zones[0];
    assert.equal(before.reported, true);
    assert.ok(before.ageMinutes <= 1);
    assert.equal(before.stale, false);

    await query(`UPDATE event_zones SET reported_at = NOW() - INTERVAL '3 hours' WHERE event_id = $1`, [event.id]);
    const c = await center();
    const old = c.operations.zones[0];
    assert.ok(old.ageMinutes >= 179 && old.ageMinutes <= 181);
    assert.equal(old.stale, true);
    assert.equal(c.staleAfterMinutes, 60);
  });

  it('never claims a status for a zone nobody has reported on', async () => {
    const fresh = await api('POST', `/api/events/${event.id}/zones`, org.token, { name: 'Library Lawn' });
    const c = await center();
    const z = c.operations.zones.find((x) => x.id === fresh.body.zone.id);
    assert.equal(z.reported, false);
    assert.equal(z.ageMinutes, null);
    assert.equal(z.stale, false);
  });

  it('includes the current session with the people scanned into it', async () => {
    const hasWindow = (await query(`SELECT (LOCALTIME - INTERVAL '1 hour')::time < LOCALTIME AS ok`))[0].ok;
    if (!hasWindow) return;
    const created = await api('POST', `/api/events/${event.id}/schedule`, org.token, {
      title: 'Opening Talk', sessionType: 'talk', date: dayOffset(0), startTime: '00:00', endTime: '23:59', venue: 'Hall A', speaker: 'Dr. Rao', description: '',
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const c = await center();
    assert.equal(c.sessions.total, 1);
    assert.equal(c.sessions.today, 1);
    assert.equal(c.sessions.current[0].title, 'Opening Talk');
    assert.equal(c.sessions.current[0].scanned, 0);
  });

  it('describes an ended event and its recommendations as wrap-up work', async () => {
    await query(`UPDATE events SET date = CURRENT_DATE - 2, end_date = NULL, start_time = '09:00', end_time = '12:00' WHERE id = $1`, [event.id]);
    const c = await center();
    assert.equal(c.phase.key, 'ended');
    const list = await recs();
    assert.ok(byKey(list, 'certificates-pending'), 'certificates reminder once people attended');
    assert.equal(byKey(list, 'registration-low-fill')?.status ?? 'resolved', 'resolved', 'registration advice no longer applies after the event');
  });

  it('is not available for events that belong to someone else', async () => {
    assert.equal((await api('GET', `/api/events/${event.id}/control-center`, org2.token)).status, 403);
  });
});
