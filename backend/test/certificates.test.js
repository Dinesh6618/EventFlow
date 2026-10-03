import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { dayOffset, query, startServer } from './helpers.js';

const { runReminders } = await import('../src/services/reminders.js');
const { verificationUrl } = await import('../src/services/certificatePdf.js');
const { config } = await import('../src/config.js');

// Phase 7: certificates, public verification, feedback.
let t;
let org;
let org2;
let event;
let judge;
let volunteer;
const p = {};
const teams = [];

const api = (method, url, token, json) => t.api(method, url, { token, json });
const base = () => `/api/events/${event.id}`;
const issue = (body, token = org.token) => api('POST', `${base()}/certificates`, token, body);
const listCerts = async () => (await api('GET', `${base()}/certificates`, org.token)).body;
const myCerts = async (u) => (await api('GET', '/api/certificates/mine', u.token)).body.certificates;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com', { name: 'Olivia Organizer' });
  org2 = await t.signUp('organizer', 'org2@x.com');
  for (const n of ['ann', 'ben', 'cam', 'dee', 'eve', 'fox']) p[n] = await t.signUp('participant', `${n}@x.com`, { name: n[0].toUpperCase() + n.slice(1) });
  judge = await t.signUp('participant', 'judge@x.com', { name: 'Jo Judge' });
  volunteer = await t.signUp('participant', 'vol@x.com', { name: 'Vik Volunteer' });
  event = await t.createEvent(org.token, { name: 'Cert Fest', teamEnabled: 'true', minTeamSize: '1', maxTeamSize: '3' });

  for (const n of ['ann', 'ben', 'cam', 'dee', 'eve', 'fox']) await t.api('POST', `${base()}/registrations`.replace('/events', '/events'), { token: p[n].token });
  await api('POST', `${base()}/staff`, org.token, { email: 'judge@x.com', role: 'judge' });
  await api('POST', `${base()}/staff`, org.token, { email: 'vol@x.com', role: 'volunteer' });

  // Three teams: Ann, Ben, Cam each lead one (Dee joins Ann's).
  for (const n of ['ann', 'ben', 'cam']) {
    const res = await api('POST', `${base()}/teams`, p[n].token, { name: `Team ${n}`, projectTitle: `Project ${n}`, projectDescription: 'x', skills: [] });
    teams.push(res.body.team);
  }
  const inv = await api('POST', `/api/teams/${teams[0].id}/invitations`, p.ann.token, { userId: p.dee.user.id });
  await api('POST', `/api/invitations/${inv.body.invitation.id}/respond`, p.dee.token, { accept: true });

  // One criterion worth 100; the judge scores 90 / 80 / 70.
  const crit = (await api('POST', `${base()}/criteria`, org.token, { name: 'Overall', maxScore: 100 })).body.criterion;
  for (const team of teams) await api('PUT', `${base()}/judging/assignments/${judge.user.id}`, org.token, { teamIds: teams.map((x) => x.id) });
  const scores = [90, 80, 70];
  for (const [i, team] of teams.entries()) {
    await api('POST', `${base()}/judging/teams/${team.id}/evaluation/submit`, judge.token, { scores: { [crit.id]: scores[i] }, comments: '' });
  }
});
after(() => t.stop());

const finishEvent = () =>
  query(`UPDATE events SET date = CURRENT_DATE - 2, end_date = NULL, registration_deadline = NOW() - INTERVAL '5 days' WHERE id = $1`, [event.id]);

describe('issuing certificates', () => {
  it('lets the organizer issue before the event starts, hides it from the holder until then, and is organizer-only', async () => {
    const early = await issue({ type: 'participant', scope: 'registered' });
    assert.equal(early.status, 201);
    assert.ok(early.body.issued > 0);
    assert.equal((await listCerts()).visibleToHolders, false);
    const code = early.body.certificates[0].code;
    // Participants see nothing, and cannot download, before the start time.
    for (const person of Object.values(p)) {
      assert.deepEqual((await api('GET', '/api/certificates/mine', person.token)).body.certificates, []);
      assert.equal((await api('GET', `/api/certificates/${code}/pdf`, person.token)).status, 404);
    }
    assert.equal((await api('GET', `/api/certificates/${code}/pdf`, org.token)).status, 200);
    assert.equal((await issue({ type: 'participant' }, p.ann.token)).status, 403);
    assert.equal((await issue({ type: 'participant' }, org2.token)).status, 403);
    assert.equal((await api('GET', `${base()}/certificates`, org2.token)).status, 403);
    assert.equal((await issue({ type: 'trophy' })).status, 422);
    // Start the event: the same certificates now reach their holders.
    await finishEvent();
    const counts = await Promise.all(Object.values(p).map(async (person) => (await api('GET', '/api/certificates/mine', person.token)).body.certificates.length));
    assert.ok(counts.some((n) => n > 0), 'holders see their certificates once the event has started');
    await query(`DELETE FROM certificates WHERE event_id = $1`, [event.id]);
  });

  it('issues participation certificates only to people who attended, with unique IDs', async () => {
    const regs = (await api('GET', '/api/organizer/participants?pageSize=50', org.token)).body.registrations;
    for (const name of ['Ann', 'Ben', 'Cam']) {
      const reg = regs.find((r) => r.participantName === name);
      await query(`INSERT INTO attendance (registration_id, event_id, user_id, status) VALUES ($1, $2, $3, 'checked_in')`, [reg.id, event.id, reg.userId]);
    }
    const before = await listCerts();
    assert.equal(before.eligibility.participant.eligible, 3);
    assert.equal(before.canIssue, true);

    const res = await issue({ type: 'participant' });
    assert.equal(res.status, 201);
    assert.equal(res.body.issued, 3);
    const codes = res.body.certificates.map((c) => c.code);
    assert.ok(codes.every((c) => /^EVF-\d{4}-\d{6}$/.test(c)));
    assert.equal(new Set(codes).size, 3);

    assert.equal((await issue({ type: 'participant' })).status, 409, 'nothing new to issue');
    assert.equal((await myCerts(p.ann)).length, 1);
    assert.equal((await myCerts(p.dee)).length, 0, 'Dee registered but did not attend');
    assert.ok((await api('GET', '/api/notifications', p.ann.token)).body.notifications.some((n) => n.type === 'certificate_issued'));
  });

  it('can include everyone who was registered when asked', async () => {
    const res = await issue({ type: 'participant', scope: 'registered' });
    assert.equal(res.body.issued, 3, 'Dee, Eve and Fox are added; Ann, Ben and Cam keep theirs');
  });

  it('awards winner, runner-up and finalist from the leaderboard', async () => {
    const winner = await issue({ type: 'winner' });
    assert.equal(winner.body.issued, 2, "Team ann's two members");
    assert.deepEqual((await myCerts(p.ann)).map((c) => c.type).sort(), ['participant', 'winner']);
    assert.deepEqual((await myCerts(p.dee)).map((c) => c.type).sort(), ['participant', 'winner']);

    assert.equal((await issue({ type: 'runner_up' })).body.issued, 1);
    assert.ok((await myCerts(p.ben)).some((c) => c.type === 'runner_up'));
    assert.equal((await issue({ type: 'finalist' })).body.issued, 1);
    assert.ok((await myCerts(p.cam)).some((c) => c.type === 'finalist'));
    assert.equal((await issue({ type: 'winner' })).status, 409, 'no duplicates');
  });

  it('covers volunteers, judges and the organizer', async () => {
    assert.equal((await issue({ type: 'volunteer' })).body.issued, 1);
    assert.equal((await issue({ type: 'judge' })).body.issued, 1);
    const mine = await issue({ type: 'organizer' });
    assert.equal(mine.body.issued, 1);
    assert.deepEqual((await myCerts(judge)).map((c) => c.type), ['judge']);
    assert.equal((await myCerts(volunteer))[0].eventName, 'Cert Fest');
  });

  it('issues speaker certificates by name, linking an account when an email is given', async () => {
    const ext = await issue({ type: 'speaker', recipients: [{ name: 'Dr. Visiting Speaker' }] });
    assert.equal(ext.status, 201);
    assert.equal((await issue({ type: 'speaker', recipients: [{ name: 'dr. visiting speaker' }] })).status, 409, 'same person, same type');

    const linked = await issue({ type: 'speaker', recipients: [{ name: 'Fox', email: 'fox@x.com' }] });
    assert.equal(linked.status, 201);
    assert.ok((await myCerts(p.fox)).some((c) => c.type === 'speaker'));

    const unknown = await issue({ type: 'speaker', recipients: [{ name: 'Nobody', email: 'nobody@x.com' }] });
    assert.equal(unknown.status, 422);
    assert.ok(unknown.body.errors.email);
    assert.equal((await issue({ type: 'speaker', recipients: [{ name: 'X' }] })).status, 422);
    assert.equal((await issue({ type: 'speaker' })).status, 422, 'speakers need names');
  });

  it('lists everything for the organizer, with counts', async () => {
    const all = await listCerts();
    assert.ok(all.certificates.length >= 15);
    assert.equal(all.eligibility.winner.eligible, 0);
    assert.equal(all.eligibility.winner.issued, 2);
  });
});

describe('certificate PDFs', () => {
  let ann;

  before(async () => {
    ann = (await myCerts(p.ann)).find((c) => c.type === 'winner');
  });

  it('renders a PDF for the holder and the organizer, and nobody else', async () => {
    const own = await t.api('GET', `/api/certificates/${ann.code}/pdf`, { token: p.ann.token });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('content-type'), 'application/pdf');
    assert.match(own.headers.get('content-disposition'), new RegExp(`${ann.code}\\.pdf`));
    assert.ok(own.body.startsWith('%PDF-'), 'looks like a PDF');
    assert.ok(own.body.length > 2000);

    assert.equal((await t.api('GET', `/api/certificates/${ann.code}/pdf`, { token: org.token })).status, 200);
    assert.equal((await t.api('GET', `/api/certificates/${ann.code}/pdf`, { token: p.ben.token })).status, 404);
    assert.equal((await t.api('GET', `/api/certificates/${ann.code}/pdf`, { token: org2.token })).status, 404);
    assert.equal((await t.api('GET', `/api/certificates/${ann.code}/pdf`)).status, 401);
    assert.equal((await t.api('GET', '/api/certificates/NOPE/pdf', { token: p.ann.token })).status, 404);
  });

  it('lets only the organizer preview each design, as a sample that cannot be verified', async () => {
    for (const type of ['participant', 'winner', 'speaker']) {
      const res = await t.api('GET', `${base()}/certificates/preview?type=${type}`, { token: org.token });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.ok(res.body.startsWith('%PDF-') && res.body.length > 2000);
    }
    assert.equal((await t.api('GET', `${base()}/certificates/preview?type=trophy`, { token: org.token })).status, 404);
    assert.equal((await t.api('GET', `${base()}/certificates/preview?type=winner`, { token: p.ann.token })).status, 403);
    assert.equal((await t.api('GET', `${base()}/certificates/preview?type=winner`, { token: org2.token })).status, 403);
    // The sample ID is never a real certificate.
    assert.equal((await t.api('GET', '/api/verify/EVF-SAMPLE')).status, 404);
  });

  it('stores the conducting college on the event and prints it on the certificate', async () => {
    const made = await t.createEvent(org.token, { college: '  Lakeview Engineering College ' });
    assert.equal(made.college, 'Lakeview Engineering College');
    assert.equal((await t.api('GET', `/api/events/${event.id}`, { token: org.token })).body.event.college ?? null, event.college ?? null);
    assert.equal((await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ college: 'x'.repeat(151) }) })).status, 422);
    const sample = await t.api('GET', `/api/events/${made.id}/certificates/preview?type=participant`, { token: org.token });
    assert.equal(sample.status, 200);
    assert.ok(sample.body.startsWith('%PDF-'));
    await query(`DELETE FROM events WHERE id = $1`, [made.id]);
  });

  it('points the verification QR at the public verify page', () => {
    assert.equal(verificationUrl('EVF-2026-000001'), `${config.publicAppUrl}/verify/EVF-2026-000001`);
  });
});

describe('public verification', () => {
  let code;
  let id;

  before(async () => {
    const mine = (await myCerts(p.ann)).find((c) => c.type === 'winner');
    code = mine.code;
    id = mine.id;
  });

  it('confirms a genuine certificate without exposing personal data', async () => {
    const res = await t.api('GET', `/api/verify/${code}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'VALID');
    assert.equal(res.body.valid, true);
    assert.deepEqual(Object.keys(res.body.certificate).sort(), ['code', 'eventName', 'issuedAt', 'organizer', 'participantName', 'type', 'typeLabel']);
    assert.equal(res.body.certificate.participantName, 'Ann');
    assert.equal(res.body.certificate.eventName, 'Cert Fest');
    assert.equal(res.body.certificate.typeLabel, 'Winner');
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('ann@x.com') && !text.includes('"userId"'), 'no email or ids');
    assert.equal((await t.api('GET', `/api/verify/${code.toLowerCase()}`)).status, 200, 'case-insensitive');
  });

  it('rejects unknown and malformed codes', async () => {
    const unknown = await t.api('GET', '/api/verify/EVF-2026-999999');
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.status, 'NOT_FOUND');
    assert.equal((await t.api('GET', '/api/verify/not-a-code')).status, 404);
    assert.equal((await t.api('GET', "/api/verify/EVF-2026-000001'%20OR%201=1")).status, 404);
  });

  it('marks a revoked certificate as REVOKED and stops the holder downloading it', async () => {
    assert.equal((await api('POST', `${base()}/certificates/${id}/revoke`, p.ann.token, { reason: 'x' })).status, 403);
    assert.equal((await api('POST', `${base()}/certificates/${id}/revoke`, org2.token, { reason: 'x' })).status, 403);
    assert.equal((await api('POST', `${base()}/certificates/${id}/revoke`, org.token, { reason: 'Issued in error' })).status, 200);
    assert.equal((await api('POST', `${base()}/certificates/${id}/revoke`, org.token, { reason: 'again' })).status, 409);

    const res = await t.api('GET', `/api/verify/${code}`);
    assert.equal(res.body.status, 'REVOKED');
    assert.equal(res.body.valid, false);
    assert.equal((await t.api('GET', `/api/certificates/${code}/pdf`, { token: p.ann.token })).status, 404);
    assert.ok(!(await myCerts(p.ann)).some((c) => c.code === code), 'revoked certificates leave the holder\'s list');
  });

  it('rate limits the public endpoint so IDs cannot be enumerated', async () => {
    let limited = null;
    for (let i = 0; i < 40 && !limited; i += 1) {
      const res = await t.api('GET', '/api/verify/EVF-2026-000999');
      if (res.status === 429) limited = res;
    }
    assert.ok(limited, 'a 429 appears within 40 quick requests');
    assert.ok(limited.headers.get('retry-after'));
  });
});

describe('feedback', () => {
  let fresh;
  let session;
  const fb = (user, body, eventId = fresh.id) => api('PUT', `/api/events/${eventId}/feedback`, user.token, body);

  before(async () => {
    fresh = await t.createEvent(org.token, { name: 'Feedback Fest' });
    for (const n of ['ann', 'ben', 'cam']) await t.api('POST', `/api/events/${fresh.id}/registrations`, { token: p[n].token });
    session = (await api('POST', `/api/events/${fresh.id}/schedule`, org.token, {
      title: 'Keynote', date: dayOffset(10), startTime: '09:00', endTime: '10:00', venue: 'Hall', speaker: 'Dr. Rao', sessionType: 'talk', description: '',
    })).body.item;
  });

  it('opens only after the event or session has finished, and only for registrants', async () => {
    assert.equal((await fb(p.ann, { overall: 5 })).status, 409, 'event not finished');
    assert.equal((await fb(p.ann, { overall: 5, sessionId: session.id })).status, 409, 'session not finished');
    const mine = (await api('GET', `/api/events/${fresh.id}/feedback/mine`, p.ann.token)).body;
    assert.equal(mine.event.open, false);
    assert.deepEqual(mine.sessions, []);

    await query(`UPDATE events SET date = CURRENT_DATE - 1, registration_deadline = NOW() - INTERVAL '3 days' WHERE id = $1`, [fresh.id]);
    await query(`UPDATE schedule_items SET date = CURRENT_DATE - 1 WHERE id = $1`, [session.id]);
    assert.equal((await api('GET', `/api/events/${fresh.id}/feedback/mine`, p.ann.token)).body.event.open, true);
    assert.equal((await fb(p.eve, { overall: 4 })).status, 409, 'not registered');
    assert.equal((await api('PUT', `/api/events/${fresh.id}/feedback`, org.token, { overall: 3 })).status, 403);
  });

  it('validates ratings', async () => {
    const bad = await fb(p.ann, { overall: 6, organization: 0, venue: 'x' });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.overall && bad.body.errors.organization && bad.body.errors.venue);
    assert.equal((await fb(p.ann, { comments: 'no rating' })).status, 422);
  });

  it('saves event and session feedback, one per person per target, and lets people edit it', async () => {
    const first = await fb(p.ann, { overall: 4, organization: 5, speaker: 4, venue: 3, comments: 'Well run', suggestions: 'More snacks' });
    assert.equal(first.status, 200);
    assert.equal(first.body.event.feedback.overall, 4);

    const edited = await fb(p.ann, { overall: 5, organization: 5, speaker: 4, venue: 4, comments: 'Even better on reflection', suggestions: '' });
    assert.equal(edited.body.event.feedback.overall, 5);
    assert.equal((await query('SELECT COUNT(*)::int AS n FROM feedback WHERE user_id = $1 AND session_id IS NULL', [p.ann.user.id]))[0].n, 1);

    await fb(p.ann, { sessionId: session.id, overall: 5, speaker: 5, comments: 'Great talk' });
    await fb(p.ben, { overall: 3, organization: 3, speaker: 3, venue: 2, comments: '', suggestions: 'Start on time' });
    await fb(p.ben, { sessionId: session.id, overall: 2, speaker: 3, organization: 5, venue: 5 });
    await fb(p.cam, { overall: 4, organization: 4, venue: 4 });

    const mine = (await api('GET', `/api/events/${fresh.id}/feedback/mine`, p.ann.token)).body;
    assert.equal(mine.sessions[0].feedback.overall, 5);
    const sessionRow = (await query('SELECT organization, venue FROM feedback WHERE user_id = $1 AND session_id = $2', [p.ben.user.id, session.id]))[0];
    assert.equal(sessionRow.organization, null, 'organization and venue only apply to the whole event');
    assert.equal((await fb(p.ann, { sessionId: 987654, overall: 3 })).status, 404);
  });

  it('shows the organizer averages, distribution, session ratings and anonymous comments', async () => {
    const res = await api('GET', `/api/events/${fresh.id}/feedback/summary`, org.token);
    assert.equal(res.status, 200);
    const s = res.body;
    assert.equal(s.responses, 3);
    assert.equal(s.eligible, 3);
    assert.equal(s.responseRate, 100);
    assert.equal(s.averages.overall, 4); // (5 + 3 + 4) / 3
    assert.equal(s.averages.organization, 4); // (5 + 3 + 4) / 3
    assert.equal(s.averages.venue, 3.33); // (4 + 2 + 4) / 3
    assert.deepEqual(s.distribution, [{ rating: 5, count: 1 }, { rating: 4, count: 1 }, { rating: 3, count: 1 }, { rating: 2, count: 0 }, { rating: 1, count: 0 }]);
    assert.deepEqual([s.sessions[0].title, s.sessions[0].responses, s.sessions[0].overall, s.sessions[0].speakerRating], ['Keynote', 2, 3.5, 4]);
    assert.ok(s.comments.some((c) => c.comments === 'Even better on reflection'));
    assert.ok(s.comments.some((c) => c.sessionTitle === 'Keynote' && c.comments === 'Great talk'));
    const text = JSON.stringify(s);
    assert.ok(!/ann@x\.com|"userId"|"Ann"/.test(text), 'responses are anonymous');
  });

  it('keeps the summary away from participants and other organizers', async () => {
    assert.equal((await api('GET', `/api/events/${fresh.id}/feedback/summary`, p.ann.token)).status, 403);
    assert.equal((await api('GET', `/api/events/${fresh.id}/feedback/summary`, org2.token)).status, 403);
  });

  it('asks registrants for feedback once the event is over, exactly once', async () => {
    await runReminders();
    await runReminders();
    const ask = (await api('GET', '/api/notifications?limit=50', p.cam.token)).body.notifications.filter((n) => n.type === 'feedback_request' && n.eventId === fresh.id);
    assert.equal(ask.length, 1);
    assert.equal((await api('GET', '/api/notifications?limit=50', p.eve.token)).body.notifications.filter((n) => n.eventId === fresh.id).length, 0);
  });
});
