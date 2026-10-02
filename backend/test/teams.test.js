import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startServer } from './helpers.js';

const { matchStrength, scoreSkills, cleanSkills } = await import('../src/services/skillMatch.js');

// Phase 5: teams, invitations, size rules, skill-based suggestions.
let t;
let org;
let org2;
let event;
let plain;
const people = {};

const post = (token, url, json) => t.api('POST', url, { token, json });
const register = (user, eventId = event.id) => t.api('POST', `/api/events/${eventId}/registrations`, { token: user.token });
const makeTeam = (user, body = {}, eventId = event.id) =>
  post(user.token, `/api/events/${eventId}/teams`, { name: 'Team Rocket', skills: [], ...body });
const teamOf = async (user, id) => (await t.api('GET', `/api/teams/${id}`, { token: user.token })).body;
const inbox = async (user) => (await t.api('GET', '/api/notifications', { token: user.token })).body.notifications;

before(async () => {
  t = await startServer();
  org = await t.signUp('organizer', 'org@x.com');
  org2 = await t.signUp('organizer', 'org2@x.com');
  for (const name of ['lead', 'ann', 'ben', 'cat', 'dev', 'eli', 'fay', 'outsider']) {
    people[name] = await t.signUp('participant', `${name}@x.com`, { name: name[0].toUpperCase() + name.slice(1) });
  }
  event = await t.createEvent(org.token, { name: 'Team Hack', teamEnabled: 'true', minTeamSize: '2', maxTeamSize: '3' });
  plain = await t.createEvent(org.token, { name: 'Solo Event' });
  for (const name of Object.keys(people).filter((n) => n !== 'outsider')) await register(people[name]);
  await register(people.lead, plain.id);
});
after(() => t.stop());

describe('skill matching', () => {
  it('matches exact, containing and related skills, and ignores unrelated ones', () => {
    assert.equal(matchStrength('React', 'react').strength, 'exact');
    assert.equal(matchStrength('UI/UX Designer', 'UI/UX').strength, 'close');
    assert.equal(matchStrength('UI/UX Designer', 'Figma').strength, 'related');
    assert.equal(matchStrength('UI/UX Designer', 'Product Design').strength, 'related');
    assert.equal(matchStrength('UI/UX Designer', 'Cooking'), null);
    assert.equal(matchStrength('Go', 'Gopher'), null, 'whole words only');
  });

  it('scores each needed skill by the best match and cleans user input', () => {
    const { score, matches } = scoreSkills(['UI/UX Designer', 'Python'], ['Figma', 'UI/UX', 'python']);
    assert.equal(score, 2 + 3);
    assert.equal(matches.length, 2);
    assert.deepEqual(cleanSkills(['  React ', 'react', '', 'Node  JS', 'x'.repeat(60)]), ['React', 'Node JS', 'x'.repeat(40)]);
  });
});

describe('profile skills', () => {
  it('saves and returns skills without duplicates', async () => {
    const res = await t.api('PATCH', '/api/auth/me', {
      token: people.ann.token,
      json: { name: 'Ann', department: 'CSE', college: 'ABC', skills: ['UI/UX', 'ui/ux', 'Python'] },
    });
    assert.deepEqual(res.body.user.skills, ['Python', 'UI/UX']);
    const keep = await t.api('PATCH', '/api/auth/me', { token: people.ann.token, json: { name: 'Ann', department: 'CSE', college: 'ABC' } });
    assert.deepEqual(keep.body.user.skills, ['Python', 'UI/UX'], 'omitting skills leaves them untouched');
    const tooMany = await t.api('PATCH', '/api/auth/me', { token: people.ann.token, json: { name: 'Ann', skills: Array.from({ length: 16 }, (_, i) => `s${i}`) } });
    assert.equal(tooMany.status, 422);
  });
});

describe('creating teams', () => {
  it('requires a team event and a seat, and one team per person by default', async () => {
    assert.equal((await makeTeam(people.outsider)).status, 409, 'unregistered');
    assert.equal((await makeTeam(people.lead, {}, plain.id)).status, 409, 'teams disabled for that event');
    assert.equal((await makeTeam(org)).status, 403, 'organizers do not join teams');

    const created = await makeTeam(people.lead, { projectTitle: 'Rocket', skills: ['UI/UX Designer'] });
    assert.equal(created.status, 201);
    assert.equal(created.body.team.leaderName, 'Lead');
    assert.equal(created.body.team.memberCount, 1);
    assert.deepEqual(created.body.team.skills, ['UI/UX Designer']);
    people.lead.teamId = created.body.team.id;

    assert.equal((await makeTeam(people.lead, { name: 'Another' })).status, 409, 'already in a team');
    const dup = await makeTeam(people.ann, { name: 'team rocket' });
    assert.equal(dup.status, 409);
    assert.ok(dup.body.errors.name);
    assert.equal((await makeTeam(people.ann, { name: 'x' })).status, 422);
  });

  it('shows teams only to people with a seat and the organizer', async () => {
    assert.equal((await t.api('GET', `/api/events/${event.id}/teams`, { token: people.outsider.token })).status, 403);
    assert.equal((await t.api('GET', `/api/events/${event.id}/teams`, { token: org2.token })).status, 403);
    const view = await t.api('GET', `/api/events/${event.id}/teams`, { token: people.ann.token });
    assert.equal(view.status, 200);
    assert.equal(view.body.teams[0].name, 'Team Rocket');
    assert.deepEqual(view.body.rules, { enabled: true, minTeamSize: 2, maxTeamSize: 3, allowMultipleTeams: false });
    assert.equal((await t.api('GET', `/api/events/${event.id}/teams`, { token: org.token })).status, 200);
  });
});

describe('invitations and requests', () => {
  it('lets a leader invite, and only the invitee answer', async () => {
    const teamId = people.lead.teamId;
    assert.equal((await post(people.ann.token, `/api/teams/${teamId}/invitations`, { userId: people.ben.user.id })).status, 409, 'non-leaders cannot invite');
    assert.equal((await post(people.lead.token, `/api/teams/${teamId}/invitations`, { userId: people.outsider.user.id })).status, 409, 'must be registered');
    const sent = await post(people.lead.token, `/api/teams/${teamId}/invitations`, { userId: people.ann.user.id });
    assert.equal(sent.status, 201);
    assert.equal((await post(people.lead.token, `/api/teams/${teamId}/invitations`, { userId: people.ann.user.id })).status, 409, 'no duplicates');
    assert.ok((await inbox(people.ann)).some((n) => n.type === 'team_invitation' && n.message.includes('Team Rocket')));

    const id = sent.body.invitation.id;
    assert.equal((await post(people.ben.token, `/api/invitations/${id}/respond`, { accept: true })).status, 404, 'a stranger cannot answer');
    assert.equal((await post(people.lead.token, `/api/invitations/${id}/respond`, { accept: true })).status, 404, 'the inviter cannot answer for them');
    assert.equal((await post(people.ann.token, `/api/invitations/${id}/respond`, { accept: 'yes' })).status, 422);

    const accepted = await post(people.ann.token, `/api/invitations/${id}/respond`, { accept: true });
    assert.equal(accepted.status, 200);
    assert.equal((await post(people.ann.token, `/api/invitations/${id}/respond`, { accept: true })).status, 409, 'already answered');
    assert.ok((await inbox(people.lead)).some((n) => n.title === 'Invitation accepted'));

    const team = (await teamOf(people.lead, teamId)).team;
    assert.deepEqual(team.members.map((m) => [m.name, m.role]), [['Lead', 'leader'], ['Ann', 'member']]);
  });

  it('handles join requests: the leader decides', async () => {
    const teamId = people.lead.teamId;
    const req = await post(people.ben.token, `/api/teams/${teamId}/requests`);
    assert.equal(req.status, 201);
    assert.ok((await inbox(people.lead)).some((n) => n.type === 'team_request'));
    assert.equal((await post(people.ben.token, `/api/teams/${teamId}/requests`)).status, 409, 'already pending');

    const id = req.body.invitation.id;
    assert.equal((await post(people.ben.token, `/api/invitations/${id}/respond`, { accept: true })).status, 404, 'requesters cannot approve themselves');
    const detail = await teamOf(people.lead, teamId);
    assert.equal(detail.invitations.length, 1);
    assert.equal(detail.invitations[0].name, 'Ben');
    assert.equal((await teamOf(people.ann, teamId)).invitations, undefined, 'members do not see requests');

    assert.equal((await post(people.lead.token, `/api/invitations/${id}/respond`, { accept: true })).status, 200);
    assert.equal((await teamOf(people.lead, teamId)).team.memberCount, 3);
  });

  it('enforces the maximum team size', async () => {
    const teamId = people.lead.teamId; // 3 of 3
    assert.equal((await post(people.lead.token, `/api/teams/${teamId}/invitations`, { userId: people.cat.user.id })).status, 409);
    assert.equal((await post(people.cat.token, `/api/teams/${teamId}/requests`)).status, 409);
  });

  it('keeps people out of a second team and clears their other open invitations', async () => {
    const other = await makeTeam(people.cat, { name: 'Cat Squad' });
    people.cat.teamId = other.body.team.id;
    assert.equal((await post(people.ann.token, `/api/teams/${people.cat.teamId}/requests`)).status, 409, 'Ann is already in Team Rocket');

    const invite = await post(people.cat.token, `/api/teams/${people.cat.teamId}/invitations`, { userId: people.dev.user.id });
    const ask = await post(people.dev.token, `/api/teams/${people.lead.teamId}/requests`);
    assert.equal(ask.status, 409, 'Team Rocket is full');
    const eliInvite = await post(people.cat.token, `/api/teams/${people.cat.teamId}/invitations`, { userId: people.eli.user.id });
    await post(people.eli.token, `/api/invitations/${eliInvite.body.invitation.id}/respond`, { accept: true });
    const mineAfter = (await t.api('GET', '/api/me/invitations', { token: people.eli.token })).body.invitations;
    assert.equal(mineAfter.length, 0);
    assert.equal((await post(people.dev.token, `/api/invitations/${invite.body.invitation.id}/respond`, { accept: false })).status, 200);
  });

  it('never overfills a team when the last seat is contested', async () => {
    const lastSeat = await t.createEvent(org.token, { name: 'Race Hack', teamEnabled: 'true', minTeamSize: '1', maxTeamSize: '2' });
    const racers = await Promise.all([1, 2, 3, 4].map((n) => t.signUp('participant', `racer${n}@x.com`)));
    for (const r of racers) await register(r, lastSeat.id);
    const team = (await makeTeam(racers[0], { name: 'Racers' }, lastSeat.id)).body.team;
    const asks = await Promise.all(racers.slice(1).map((r) => post(r.token, `/api/teams/${team.id}/requests`)));
    assert.equal(asks.filter((a) => a.status === 201).length, 3);
    const answers = await Promise.all(asks.map((a) => post(racers[0].token, `/api/invitations/${a.body.invitation.id}/respond`, { accept: true })));
    assert.equal(answers.filter((a) => a.status === 200).length, 1, 'only one fits');
    assert.equal((await teamOf(racers[0], team.id)).team.memberCount, 2);
  });
});

describe('leaving and removing', () => {
  it('lets the leader remove members, and members withdraw', async () => {
    const teamId = people.lead.teamId;
    assert.equal((await t.api('DELETE', `/api/teams/${teamId}/members/${people.ben.user.id}`, { token: people.ann.token })).status, 409, 'only the leader');
    assert.equal((await t.api('DELETE', `/api/teams/${teamId}/members/${people.lead.user.id}`, { token: people.lead.token })).status, 409, 'leader uses leave');
    assert.equal((await t.api('DELETE', `/api/teams/${teamId}/members/${people.ben.user.id}`, { token: people.lead.token })).status, 204);
    assert.ok((await inbox(people.ben)).some((n) => n.title === 'Removed from team'));
    assert.equal((await post(people.ben.token, `/api/teams/${teamId}/leave`)).status, 409, 'no longer a member');
  });

  it('passes leadership on when the leader leaves and closes an empty team', async () => {
    const teamId = people.lead.teamId;
    const left = await post(people.lead.token, `/api/teams/${teamId}/leave`);
    assert.equal(left.body.disbanded, false);
    const team = (await teamOf(people.ann, teamId)).team;
    assert.equal(team.leaderName, 'Ann');
    assert.equal(team.members[0].role, 'leader');
    assert.ok((await inbox(people.ann)).some((n) => n.title === 'You are now team leader'));

    const last = await post(people.ann.token, `/api/teams/${teamId}/leave`);
    assert.equal(last.body.disbanded, true);
    assert.equal((await t.api('GET', `/api/teams/${teamId}`, { token: people.ann.token })).status, 404);
  });
});

describe('skill-based suggestions', () => {
  it('ranks registered participants by how well their skills fit what the team needs', async () => {
    const skills = {
      ann: ['UI/UX'], // close
      ben: ['Figma'], // related
      cat: ['Product Design'], // related
      dev: ['Cooking'], // unrelated
      fay: ['python'],
    };
    for (const [name, list] of Object.entries(skills)) {
      await t.api('PATCH', '/api/auth/me', { token: people[name].token, json: { name: people[name].user.name, department: 'CSE', college: 'ABC', skills: list } });
    }
    const leader = people.lead;
    const created = await makeTeam(leader, { name: 'Design Hunters', skills: ['UI/UX Designer'] });
    assert.equal(created.status, 201);
    const teamId = created.body.team.id;

    // cat leads a team already (Cat Squad) and eli joined it, so they are not available.
    const res = await t.api('GET', `/api/teams/${teamId}/suggestions`, { token: leader.token });
    assert.deepEqual(res.body.needed, ['UI/UX Designer']);
    assert.deepEqual(res.body.suggestions.map((s) => s.name), ['Ann', 'Ben']);
    assert.deepEqual(res.body.suggestions.map((s) => s.score), [2, 1]);
    assert.equal(res.body.suggestions[0].matches[0].strength, 'close');
    assert.ok(!res.body.suggestions.some((s) => s.name === 'Dev'), 'unrelated skills are not suggested');

    const custom = await t.api('GET', `/api/teams/${teamId}/suggestions?skill=Python`, { token: leader.token });
    assert.deepEqual(custom.body.suggestions.map((s) => s.name), ['Fay']);

    assert.equal((await t.api('GET', `/api/teams/${teamId}/suggestions`, { token: people.ann.token })).status, 403, 'leaders only');
    assert.equal((await t.api('GET', `/api/teams/${teamId}/suggestions`, { token: org.token })).status, 200, 'the organizer may look');

    // Inviting someone removes them from later suggestions.
    await post(leader.token, `/api/teams/${teamId}/invitations`, { userId: people.ann.user.id });
    const after = await t.api('GET', `/api/teams/${teamId}/suggestions`, { token: leader.token });
    assert.deepEqual(after.body.suggestions.map((s) => s.name), ['Ben']);
    people.lead.teamId = teamId;
  });

  it('surfaces the teams that fit a participant\'s own skills first', async () => {
    const list = await t.api('GET', `/api/events/${event.id}/teams`, { token: people.fay.token });
    assert.ok(list.body.teams.length >= 2);
    const mine = await t.api('GET', `/api/events/${event.id}/teams`, { token: people.ben.token });
    assert.equal(mine.body.teams[0].name, 'Design Hunters', 'Figma fits a team that needs a UI/UX designer');
    assert.equal(mine.body.teams[0].matchScore, 1);
    assert.equal(mine.body.teams[0].myInvitation, null);
  });
});

describe('organizer controls', () => {
  it('lets only the owner change settings, and protects existing teams', async () => {
    const put = (token, body) => t.api('PATCH', `/api/events/${event.id}/team-settings`, { token, json: body });
    const settings = { teamEnabled: true, minTeamSize: 2, maxTeamSize: 5, allowMultipleTeams: false };
    assert.equal((await put(people.lead.token, settings)).status, 403);
    assert.equal((await put(org2.token, settings)).status, 403);
    assert.equal((await put(org.token, { ...settings, minTeamSize: 4, maxTeamSize: 2 })).status, 422);
    assert.deepEqual((await put(org.token, settings)).body.rules, { enabled: true, minTeamSize: 2, maxTeamSize: 5, allowMultipleTeams: false });

    // Cat's team has Cat + Eli (2 members): the maximum cannot drop below that.
    const tooSmall = await put(org.token, { ...settings, minTeamSize: 1, maxTeamSize: 1 });
    assert.equal(tooSmall.status, 422);
    assert.match(tooSmall.body.errors.maxTeamSize, /already has 2 members/);
    await put(org.token, { ...settings, maxTeamSize: 3 });
  });

  it('allows several teams per person when the organizer turns that on', async () => {
    const open = await t.createEvent(org.token, { name: 'Open Teams', teamEnabled: 'true', allowMultipleTeams: 'true' });
    await register(people.fay, open.id);
    await register(people.ben, open.id);
    const a = await makeTeam(people.fay, { name: 'Alpha' }, open.id);
    const b = await makeTeam(people.fay, { name: 'Beta' }, open.id);
    assert.equal(a.status, 201);
    assert.equal(b.status, 201, 'a second team is fine');
    const invite = await post(people.fay.token, `/api/teams/${a.body.team.id}/invitations`, { userId: people.ben.user.id });
    await post(people.ben.token, `/api/invitations/${invite.body.invitation.id}/respond`, { accept: true });
    const second = await post(people.fay.token, `/api/teams/${b.body.team.id}/invitations`, { userId: people.ben.user.id });
    assert.equal((await post(people.ben.token, `/api/invitations/${second.body.invitation.id}/respond`, { accept: true })).status, 200);

    const doubled = await t.api('PATCH', `/api/events/${open.id}/team-settings`, {
      token: org.token,
      json: { teamEnabled: true, minTeamSize: 1, maxTeamSize: 4, allowMultipleTeams: false },
    });
    assert.equal(doubled.status, 409, 'cannot forbid multiple teams while someone is in two');
  });

  it('shows the organizer every team and who is still unassigned, and lets them disband one', async () => {
    const view = await t.api('GET', `/api/events/${event.id}/teams/overview`, { token: org.token });
    assert.ok(view.body.teams.length >= 2);
    assert.ok(view.body.unassigned.some((u) => u.name === 'Dev'));
    assert.equal((await t.api('GET', `/api/events/${event.id}/teams/overview`, { token: people.lead.token })).status, 403);

    const target = view.body.teams.find((team) => team.name === 'Cat Squad');
    assert.equal((await t.api('DELETE', `/api/teams/${target.id}`, { token: people.dev.token })).status, 404);
    assert.equal((await t.api('DELETE', `/api/teams/${target.id}`, { token: org.token })).status, 204);
    assert.ok((await inbox(people.eli)).some((n) => n.title === 'Team disbanded'));
  });

  it('reports team rules on new events through the event API', async () => {
    const created = await t.api('GET', `/api/events/${event.id}`, { token: org.token });
    assert.equal(created.body.event.teamEnabled, true);
    assert.equal(created.body.event.maxTeamSize, 3);
    const bad = await t.api('POST', '/api/events', { token: org.token, form: t.eventForm({ teamEnabled: 'true', minTeamSize: '5', maxTeamSize: '2' }) });
    assert.equal(bad.status, 422);
    assert.ok(bad.body.errors.maxTeamSize);
  });
});
