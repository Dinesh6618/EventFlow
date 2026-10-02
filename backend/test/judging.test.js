import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startServer } from './helpers.js';

// Phase 6: criteria, judge assignments, evaluations, leaderboard.
let t;
let org;
let org2;
let event;
let judge1;
let judge2;
let outsider;
const leads = [];
const teams = [];
let criteria;

const base = () => `/api/events/${event.id}`;
const api = (method, url, token, json) => t.api(method, url, { token, json });
const evaluate = (judge, teamId, scores, comments = '', action = 'evaluation') =>
  api(action === 'submit' ? 'POST' : 'PUT', `${base()}/judging/teams/${teamId}/evaluation${action === 'submit' ? '/submit' : ''}`, judge.token, { scores, comments });
const scoresFor = (a, b, c) => ({ [criteria[0].id]: a, [criteria[1].id]: b, [criteria[2].id]: c });
const board = async (token = org.token) => (await api('GET', `${base()}/leaderboard`, token)).body;
const inbox = async (u) => (await api('GET', '/api/notifications?limit=50', u.token)).body.notifications;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  judge1 = await t.signUp('participant', 'judge1@x.com', { name: 'Judge One' });
  judge2 = await t.signUp('participant', 'judge2@x.com', { name: 'Judge Two' });
  outsider = await t.signUp('participant', 'out@x.com', { name: 'Outsider' });
  event = await t.createEvent(org.token, { name: 'Judged Hack', teamEnabled: 'true', minTeamSize: '1', maxTeamSize: '3' });

  for (const n of [1, 2, 3, 4]) {
    const lead = await t.signUp('participant', `lead${n}@x.com`, { name: `Lead ${n}` });
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: lead.token });
    const created = await t.api('POST', `/api/events/${event.id}/teams`, {
      token: lead.token,
      json: { name: `Team ${n}`, projectTitle: `Project ${n}`, projectDescription: `About project ${n}`, skills: [] },
    });
    leads.push(lead);
    teams.push(created.body.team);
  }
  for (const j of [judge1, judge2]) await api('POST', `${base()}/staff`, org.token, { email: j.user.email, role: 'judge' });
});
after(() => t.stop());

describe('team project submission', () => {
  it('lets only the leader submit, and needs a title and description', async () => {
    const lead = leads[3];
    const empty = await t.api('POST', '/api/events/' + event.id + '/teams', { token: (await t.signUp('participant', 'blank@x.com')).token, json: {} });
    assert.equal(empty.status, 422);

    const bad = await api('PATCH', `/api/teams/${teams[3].id}`, lead.token, { name: 'Team 4', projectTitle: 'P4', projectDescription: 'D4', repositoryUrl: 'javascript:alert(1)', skills: [] });
    assert.equal(bad.status, 422);
    assert.match(bad.body.errors.repositoryUrl, /http/);

    const ok = await api('PATCH', `/api/teams/${teams[3].id}`, lead.token, { name: 'Team 4', projectTitle: 'Project 4', projectDescription: 'About project 4', repositoryUrl: 'https://github.com/x/y', demoUrl: '', skills: [] });
    assert.equal(ok.body.team.repositoryUrl, 'https://github.com/x/y');

    assert.equal((await api('POST', `/api/teams/${teams[3].id}/submit`, judge1.token)).status, 409, 'not a member');
    const sub = await api('POST', `/api/teams/${teams[3].id}/submit`, lead.token);
    assert.equal(sub.status, 200);
    assert.ok(sub.body.team.submittedAt);
  });

  it('refuses to submit an empty project', async () => {
    const solo = await t.signUp('participant', 'solo@x.com');
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: solo.token });
    const created = await t.api('POST', `/api/events/${event.id}/teams`, { token: solo.token, json: { name: 'Solo', skills: [] } });
    const res = await api('POST', `/api/teams/${created.body.team.id}/submit`, solo.token);
    assert.equal(res.status, 422);
    await api('DELETE', `/api/teams/${created.body.team.id}`, solo.token);
  });
});

describe('criteria', () => {
  it('lets only the owning organizer manage criteria, and totals them', async () => {
    const add = (token, body) => api('POST', `${base()}/criteria`, token, body);
    assert.equal((await add(judge1.token, { name: 'Innovation', maxScore: 40 })).status, 403);
    assert.equal((await add(org2.token, { name: 'Innovation', maxScore: 40 })).status, 403);
    assert.equal((await add(org.token, { name: '', maxScore: 0 })).status, 422);
    assert.equal((await add(org.token, { name: 'Innovation', maxScore: 1001 })).status, 422);

    const a = await add(org.token, { name: 'Innovation', description: 'Originality', maxScore: 40 });
    assert.equal(a.status, 201);
    assert.equal((await add(org.token, { name: 'innovation', maxScore: 10 })).status, 409, 'names are unique');
    await add(org.token, { name: 'Technical', maxScore: 40 });
    await add(org.token, { name: 'Impact', maxScore: 20 });

    const list = await api('GET', `${base()}/criteria`, org.token);
    assert.equal(list.body.maxTotal, 100);
    criteria = list.body.criteria;
    assert.deepEqual(criteria.map((c) => c.name), ['Innovation', 'Technical', 'Impact']);
  });

  it('shows criteria to people in the event only', async () => {
    assert.equal((await api('GET', `${base()}/criteria`, leads[0].token)).status, 200, 'teams can see how they are judged');
    assert.equal((await api('GET', `${base()}/criteria`, judge1.token)).status, 200);
    assert.equal((await api('GET', `${base()}/criteria`, outsider.token)).status, 403);
    assert.equal((await api('GET', `${base()}/criteria`, org2.token)).status, 403);
  });

  it('edits a criterion', async () => {
    const res = await api('PATCH', `${base()}/criteria/${criteria[2].id}`, org.token, { name: 'Impact', description: 'Real-world value', maxScore: 20 });
    assert.equal(res.body.criterion.description, 'Real-world value');
  });
});

describe('assignments', () => {
  it('assigns teams to judges, validating judges, teams and conflicts of interest', async () => {
    const put = (token, judgeId, teamIds) => api('PUT', `${base()}/judging/assignments/${judgeId}`, token, { teamIds });
    assert.equal((await put(judge1.token, judge1.user.id, [teams[0].id])).status, 403);
    assert.equal((await put(org2.token, judge1.user.id, [teams[0].id])).status, 403);
    assert.equal((await put(org.token, outsider.user.id, [teams[0].id])).status, 404, 'not a judge');
    assert.equal((await put(org.token, judge1.user.id, [987654])).status, 422);

    const ok = await put(org.token, judge1.user.id, [teams[0].id, teams[1].id, teams[2].id]);
    assert.equal(ok.status, 200);
    const mine = ok.body.judges.find((j) => j.userId === judge1.user.id);
    assert.deepEqual(mine.teamIds.sort(), [teams[0].id, teams[1].id, teams[2].id].sort());
  });

  it('refuses to let a judge score their own team', async () => {
    // Judge Two joins Team 4 as a member, then cannot be assigned to it.
    const invite = await api('POST', `/api/teams/${teams[3].id}/invitations`, leads[3].token, { userId: judge2.user.id });
    assert.equal(invite.status, 409, 'judge must hold a seat first');
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: judge2.token });
    const inv = await api('POST', `/api/teams/${teams[3].id}/invitations`, leads[3].token, { userId: judge2.user.id });
    await api('POST', `/api/invitations/${inv.body.invitation.id}/respond`, judge2.token, { accept: true });
    const res = await api('PUT', `${base()}/judging/assignments/${judge2.user.id}`, org.token, { teamIds: [teams[3].id] });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /belong to/);
  });

  it('auto-assigns evenly without touching existing assignments', async () => {
    const res = await api('POST', `${base()}/judging/auto-assign`, org.token, { judgesPerTeam: 2 });
    assert.equal(res.status, 200);
    // Teams 1-3 already have judge1; judge2 is added to each (judge2 is in Team 4 so it gets only judge1).
    const perTeam = (id) => res.body.judges.filter((j) => j.teamIds.includes(id)).length;
    assert.deepEqual([teams[0].id, teams[1].id, teams[2].id].map(perTeam), [2, 2, 2]);
    assert.equal(perTeam(teams[3].id), 1, 'Team 4 cannot use judge2, who is a member');
    assert.equal((await api('POST', `${base()}/judging/auto-assign`, org.token, { judgesPerTeam: 5 })).status, 422);
    assert.equal((await api('POST', `${base()}/judging/auto-assign`, judge1.token, { judgesPerTeam: 1 })).status, 403);
  });
});

describe('judge evaluations', () => {
  it('shows a judge only their assigned teams and project details', async () => {
    const list = await api('GET', `${base()}/judging/mine`, judge2.token);
    assert.equal(list.status, 200);
    assert.deepEqual(list.body.teams.map((x) => x.name), ['Team 1', 'Team 2', 'Team 3']);
    assert.equal(list.body.maxTotal, 100);
    assert.equal(list.body.teams[0].evaluationStatus, 'not_started');

    const detail = await api('GET', `${base()}/judging/teams/${teams[0].id}`, judge2.token);
    assert.equal(detail.body.team.projectTitle, 'Project 1');
    assert.deepEqual(detail.body.team.members.map((m) => m.name), ['Lead 1']);
    assert.equal((await api('GET', `${base()}/judging/teams/${teams[3].id}`, judge2.token)).status, 404, 'not assigned');
    assert.equal((await api('GET', `${base()}/judging/mine`, outsider.token)).status, 403);
    assert.equal((await api('GET', `${base()}/judging/mine`, org.token)).status, 403);
    assert.equal((await api('GET', '/api/me/judging', judge1.token)).body.events[0].assigned, 4);
  });

  it('validates scores against each criterion maximum', async () => {
    const tooHigh = await evaluate(judge1, teams[0].id, scoresFor(41, 30, 10));
    assert.equal(tooHigh.status, 422);
    assert.match(tooHigh.body.errors[criteria[0].id], /between 0 and 40/);
    assert.equal((await evaluate(judge1, teams[0].id, scoresFor(-1, 30, 10))).status, 422);
    assert.equal((await evaluate(judge1, teams[0].id, scoresFor('abc', 30, 10))).status, 422);
    assert.equal((await evaluate(judge1, teams[0].id, scoresFor(10.555, 30, 10))).status, 422);

    const partial = await evaluate(judge1, teams[0].id, { [criteria[0].id]: 30 }, 'work in progress');
    assert.equal(partial.status, 200, 'drafts may be partial');
    const saved = await api('GET', `${base()}/judging/teams/${teams[0].id}`, judge1.token);
    assert.equal(saved.body.evaluation.status, 'draft');
    assert.equal(saved.body.evaluation.scores[criteria[0].id], 30);
    assert.equal(saved.body.evaluation.comments, 'work in progress');

    const incomplete = await evaluate(judge1, teams[0].id, { [criteria[0].id]: 30 }, '', 'submit');
    assert.equal(incomplete.status, 422, 'submitting needs every criterion');
    assert.equal((await evaluate(outsider, teams[0].id, scoresFor(1, 1, 1))).status, 403);
    assert.equal((await evaluate(judge2, teams[3].id, scoresFor(1, 1, 1))).status, 404, 'unassigned team');
  });

  it('locks a submitted evaluation until the organizer unlocks it', async () => {
    const submitted = await evaluate(judge1, teams[0].id, scoresFor(30, 35, 15), 'Strong UX', 'submit');
    assert.equal(submitted.status, 200);

    assert.equal((await evaluate(judge1, teams[0].id, scoresFor(40, 40, 20))).status, 409, 'locked');
    assert.equal((await evaluate(judge1, teams[0].id, scoresFor(40, 40, 20), '', 'submit')).status, 409);

    const progress = await api('GET', `${base()}/judging/progress`, org.token);
    const row = progress.body.evaluations.find((e) => e.judgeId === judge1.user.id && e.teamId === teams[0].id);
    assert.equal(row.status, 'submitted');
    assert.equal(row.total, 80);
    assert.equal(row.comments, 'Strong UX');

    assert.equal((await api('POST', `${base()}/judging/evaluations/${row.evaluationId}/unlock`, judge1.token)).status, 403);
    assert.equal((await api('POST', `${base()}/judging/evaluations/${row.evaluationId}/unlock`, org2.token)).status, 403);
    assert.equal((await api('POST', `${base()}/judging/evaluations/${row.evaluationId}/unlock`, org.token)).status, 200);
    assert.ok((await inbox(judge1)).some((n) => n.type === 'judging_unlocked'));

    const edited = await evaluate(judge1, teams[0].id, scoresFor(35, 35, 15), 'Strong UX and polish');
    assert.equal(edited.status, 200, 'unlocked: edits allowed');
    const afterEdit = await api('GET', `${base()}/judging/teams/${teams[0].id}`, judge1.token);
    assert.equal(afterEdit.body.evaluation.status, 'draft', 'editing returns it to draft until re-submitted');
    await evaluate(judge1, teams[0].id, scoresFor(35, 35, 15), 'Strong UX and polish', 'submit');
    assert.equal((await evaluate(judge1, teams[0].id, scoresFor(1, 1, 1))).status, 409, 'locked again');
  });

  it('freezes criteria once scoring has started', async () => {
    assert.equal((await api('POST', `${base()}/criteria`, org.token, { name: 'Late addition', maxScore: 5 })).status, 409);
    assert.equal((await api('DELETE', `${base()}/criteria/${criteria[0].id}`, org.token)).status, 409);
    const lockedMax = await api('PATCH', `${base()}/criteria/${criteria[0].id}`, org.token, { name: 'Innovation', maxScore: 50 });
    assert.equal(lockedMax.status, 409);
    const rename = await api('PATCH', `${base()}/criteria/${criteria[0].id}`, org.token, { name: 'Innovation & novelty', maxScore: 40 });
    assert.equal(rename.status, 200, 'renaming is still fine');
  });
});

describe('leaderboard', () => {
  before(async () => {
    // Team 1: judge1 = 85 (35+35+15), judge2 = 75  -> 80
    await evaluate(judge2, teams[0].id, scoresFor(30, 30, 15), 'Needs more depth', 'submit');
    // Team 2: judge1 = 80, judge2 = 80 -> 80 (tie with Team 1)
    await evaluate(judge1, teams[1].id, scoresFor(30, 30, 20), 'Great impact', 'submit');
    await evaluate(judge2, teams[1].id, scoresFor(40, 30, 10), '', 'submit');
    // Team 3: only judge1 so far = 60 -> In progress
    await evaluate(judge1, teams[2].id, scoresFor(20, 25, 15), 'Early stage', 'submit');
  });

  it('averages submitted evaluations, ranks ties together and reports progress honestly', async () => {
    const b = await board();
    const byTeam = Object.fromEntries(b.rows.map((r) => [r.team, r]));
    assert.equal(byTeam['Team 1'].score, 80);
    assert.equal(byTeam['Team 2'].score, 80);
    assert.equal(byTeam['Team 3'].score, 60);
    assert.equal(byTeam['Team 1'].rank, 1);
    assert.equal(byTeam['Team 2'].rank, 1, 'tied teams share rank 1');
    assert.equal(byTeam['Team 3'].rank, 3, 'next rank skips the tie');
    assert.equal(byTeam['Team 1'].status, 'Final');
    assert.equal(byTeam['Team 3'].status, 'In progress');
    assert.equal(byTeam['Team 3'].evaluationsSubmitted, 1);
    assert.equal(byTeam['Team 3'].evaluationsAssigned, 2);
    assert.equal(byTeam['Team 4'].rank, null);
    assert.equal(byTeam['Team 4'].status, 'Awaiting scores');
    assert.equal(b.rows[b.rows.length - 1].team, 'Team 4', 'unscored teams come last');
    assert.equal(b.maxScore, 100);
  });

  it('gives the organizer per-criterion detail and judge comments', async () => {
    const b = await board();
    const team1 = b.rows.find((r) => r.team === 'Team 1');
    assert.deepEqual(team1.criteria.map((c) => c.average), [32.5, 32.5, 15]);
    assert.deepEqual(team1.comments.map((c) => c.comment).sort(), ['Needs more depth', 'Strong UX and polish']);
  });

  it('hides the leaderboard from everyone else until it is published', async () => {
    for (const u of [leads[0], judge1]) {
      const res = await api('GET', `${base()}/leaderboard`, u.token);
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { published: false, rows: [] });
    }
    assert.equal((await api('GET', `${base()}/leaderboard`, outsider.token)).status, 403);
    assert.equal((await api('GET', `${base()}/leaderboard`, org2.token)).status, 403);
  });

  it('publishes without leaking private judge comments', async () => {
    assert.equal((await api('PATCH', `${base()}/judging/settings`, leads[0].token, { leaderboardPublished: true, shareJudgeComments: false })).status, 403);
    const pub = await api('PATCH', `${base()}/judging/settings`, org.token, { leaderboardPublished: true, shareJudgeComments: false });
    assert.equal(pub.status, 200);
    assert.ok((await inbox(leads[0])).some((n) => n.type === 'leaderboard_published'));

    const res = await api('GET', `${base()}/leaderboard`, leads[0].token);
    assert.equal(res.body.published, true);
    assert.deepEqual(Object.keys(res.body.rows[0]).sort(), ['rank', 'score', 'status', 'team', 'teamId']);
    assert.equal(res.body.feedback, undefined);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes('Needs more depth') && !text.includes('Strong UX'), 'comments stay private');
    assert.ok(!text.includes('Judge One'), 'judge identities stay private');
  });

  it('shares comments only with the team they are about, anonymised, if the organizer allows it', async () => {
    await api('PATCH', `${base()}/judging/settings`, org.token, { leaderboardPublished: true, shareJudgeComments: true });
    const mine = await api('GET', `${base()}/leaderboard`, leads[0].token);
    assert.equal(mine.body.feedback.length, 1);
    assert.equal(mine.body.feedback[0].teamId, teams[0].id);
    assert.deepEqual(mine.body.feedback[0].comments.map((c) => c.judge), ['Judge 1', 'Judge 2']);
    assert.ok(mine.body.feedback[0].comments.some((c) => c.comment === 'Needs more depth'));
    assert.ok(!JSON.stringify(mine.body).includes('Judge One'));

    const other = await api('GET', `${base()}/leaderboard`, leads[1].token);
    assert.ok(!JSON.stringify(other.body).includes('Needs more depth'), "another team's comments are not shared");

    await api('PATCH', `${base()}/judging/settings`, org.token, { leaderboardPublished: false, shareJudgeComments: true });
    assert.deepEqual((await api('GET', `${base()}/leaderboard`, leads[0].token)).body, { published: false, rows: [] }, 'unpublishing hides everything again');
  });

  it('reports judging progress per judge and overall', async () => {
    const p = (await api('GET', `${base()}/judging/progress`, org.token)).body;
    assert.equal(p.totalAssigned, 7);
    assert.equal(p.totalSubmitted, 5);
    assert.equal(p.percentage, 71.43);
    const one = p.byJudge.find((j) => j.name === 'Judge One');
    assert.deepEqual([one.assigned, one.submitted], [4, 3]);
    assert.equal((await api('GET', `${base()}/judging/progress`, judge1.token)).status, 403);
  });

  it('keeps assigned teams with submitted scores from being unassigned', async () => {
    const res = await api('PUT', `${base()}/judging/assignments/${judge1.user.id}`, org.token, { teamIds: [teams[2].id] });
    assert.equal(res.status, 409);
    assert.match(res.body.message, /already submitted/);
  });
});

describe('conflicts of interest', () => {
  it('stops a judge from joining a team they are assigned to score', async () => {
    await t.api('POST', `/api/events/${event.id}/registrations`, { token: judge1.token });
    const invite = await api('POST', `/api/teams/${teams[0].id}/invitations`, leads[0].token, { userId: judge1.user.id });
    assert.equal(invite.status, 409);
    assert.match(invite.body.message, /assigned to judge this team/);
    const ask = await api('POST', `/api/teams/${teams[0].id}/requests`, judge1.token);
    assert.equal(ask.status, 409);
  });
});
