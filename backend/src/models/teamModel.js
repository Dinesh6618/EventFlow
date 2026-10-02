import { query, transaction } from '../db.js';
import { ACTIVE } from './registrationModel.js';
import { cleanSkills, scoreSkills, skillKey } from '../services/skillMatch.js';
import { getEventStatus } from '../utils/eventStatus.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

const TEAM_SELECT = `
  SELECT t.id, t.event_id AS "eventId", t.name, t.leader_id AS "leaderId", lu.name AS "leaderName",
         t.project_title AS "projectTitle", t.project_description AS "projectDescription",
         t.repository_url AS "repositoryUrl", t.demo_url AS "demoUrl", t.submitted_at AS "submittedAt",
         t.created_at AS "createdAt",
         COALESCE((SELECT array_agg(ts.skill ORDER BY ts.skill) FROM team_skills ts WHERE ts.team_id = t.id), '{}') AS skills,
         (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id) AS "memberCount"
    FROM teams t JOIN users lu ON lu.id = t.leader_id`;

const MEMBER_SELECT = `
  SELECT m.team_id AS "teamId", m.user_id AS "userId", u.name, u.department, u.college, m.role, m.joined_at AS "joinedAt",
         COALESCE((SELECT array_agg(s.skill ORDER BY s.skill) FROM user_skills s WHERE s.user_id = u.id), '{}') AS skills
    FROM team_members m JOIN users u ON u.id = m.user_id`;

/** Lock the event row and read its team rules. All membership changes go through this. */
async function lockEvent(run, eventId) {
  const rows = await run(
    `SELECT id, organizer_id AS "organizerId", team_enabled AS "teamEnabled", min_team_size AS "minTeamSize",
            max_team_size AS "maxTeamSize", allow_multiple_teams AS "allowMultipleTeams",
            to_char(date, 'YYYY-MM-DD') AS date, to_char(COALESCE(end_date, date), 'YYYY-MM-DD') AS "endDate",
            to_char(start_time, 'HH24:MI') AS "startTime", to_char(end_time, 'HH24:MI') AS "endTime"
       FROM events WHERE id = $1 FOR UPDATE`,
    [eventId],
  );
  if (!rows[0]) throw notFound('Event not found');
  return rows[0];
}

function assertTeamsOpen(event) {
  if (!event.teamEnabled) throw conflict('Teams are not enabled for this event');
  if (getEventStatus(event) === 'ended') throw conflict('This event has ended, so teams can no longer change');
}

async function assertHasSeat(run, eventId, userId, who = 'You') {
  const rows = await run(`SELECT 1 FROM registrations WHERE event_id = $1 AND user_id = $2 AND status = ANY($3)`, [eventId, userId, ACTIVE]);
  if (!rows[0]) throw conflict(`${who} must be registered for this event to join a team`);
}

/** The team (if any) a user is on for this event. */
async function teamOf(run, eventId, userId) {
  return (await run(`SELECT team_id AS "teamId" FROM team_members WHERE event_id = $1 AND user_id = $2 LIMIT 1`, [eventId, userId]))[0];
}

async function assertCanJoin(run, event, userId, who = 'You') {
  if (!event.allowMultipleTeams && (await teamOf(run, event.id, userId))) {
    throw conflict(`${who} ${who === 'You' ? 'are' : 'is'} already in a team for this event`);
  }
}

/** A judge must not join (or be invited to) a team they are assigned to score. */
async function assertNotJudging(run, teamId, userId, who) {
  if ((await run(`SELECT 1 FROM judge_assignments WHERE team_id = $1 AND judge_id = $2`, [teamId, userId]))[0]) {
    throw conflict(`${who} ${who === 'You' ? 'are' : 'is'} assigned to judge this team, so ${who === 'You' ? 'you' : 'they'} cannot join it`);
  }
}

async function replaceTeamSkills(run, teamId, skills) {
  await run(`DELETE FROM team_skills WHERE team_id = $1`, [teamId]);
  for (const skill of cleanSkills(skills)) {
    await run(`INSERT INTO team_skills (team_id, skill, skill_key) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [teamId, skill, skillKey(skill)]);
  }
}

const nameTaken = (err) => err.code === '23505' && /teams_event_name_idx/.test(`${err.constraint ?? ''}${err.message}`);

export async function findById(teamId) {
  const team = (await query(`${TEAM_SELECT} WHERE t.id = $1`, [teamId]))[0];
  if (!team) return undefined;
  team.members = await query(`${MEMBER_SELECT} WHERE m.team_id = $1 ORDER BY (m.role = 'leader') DESC, m.joined_at, m.user_id`, [teamId]);
  return team;
}

const withRules = (team, event) => ({
  ...team,
  minSize: event.minTeamSize,
  maxSize: event.maxTeamSize,
  isFull: team.memberCount >= event.maxTeamSize,
  isComplete: team.memberCount >= event.minTeamSize,
});

/** All teams of an event with members, plus how each relates to `viewerId`. */
export async function listForEvent(event, viewerId = null) {
  const [teams, members, mine, viewer] = await Promise.all([
    query(`${TEAM_SELECT} WHERE t.event_id = $1 ORDER BY t.created_at, t.id`, [event.id]),
    query(`${MEMBER_SELECT} WHERE m.event_id = $1 ORDER BY (m.role = 'leader') DESC, m.joined_at, m.user_id`, [event.id]),
    viewerId
      ? query(
          `SELECT i.id, i.team_id AS "teamId", i.kind FROM team_invitations i JOIN teams t ON t.id = i.team_id
            WHERE t.event_id = $1 AND i.user_id = $2 AND i.status = 'pending'`,
          [event.id, viewerId],
        )
      : [],
    viewerId ? query(`SELECT skill FROM user_skills WHERE user_id = $1`, [viewerId]) : [],
  ]);
  const mySkills = viewer.map((r) => r.skill);

  return teams.map((team) => {
    const teamMembers = members.filter((m) => m.teamId === team.id).map(({ skills: _skills, ...m }) => m);
    const me = teamMembers.find((m) => m.userId === viewerId);
    const open = mine.find((i) => i.teamId === team.id);
    const { score, matches } = scoreSkills(team.skills, mySkills);
    return {
      ...withRules(team, event),
      members: teamMembers,
      myRole: me?.role ?? null,
      myInvitation: open ? { id: open.id, kind: open.kind } : null,
      matchScore: me ? 0 : score,
      matchedSkills: me ? [] : matches,
    };
  });
}

export async function create(eventId, userId, data) {
  try {
    return await transaction(async (run) => {
      const event = await lockEvent(run, eventId);
      assertTeamsOpen(event);
      await assertHasSeat(run, eventId, userId);
      await assertCanJoin(run, event, userId);

      const rows = await run(
        `INSERT INTO teams (event_id, name, leader_id, project_title, project_description)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [eventId, data.name, userId, data.projectTitle, data.projectDescription],
      );
      const teamId = rows[0].id;
      await run(`INSERT INTO team_members (team_id, user_id, event_id, role) VALUES ($1, $2, $3, 'leader')`, [teamId, userId, eventId]);
      await replaceTeamSkills(run, teamId, data.skills);
      // Requests the leader sent earlier to other teams are moot once they lead their own.
      if (!event.allowMultipleTeams) {
        await run(`UPDATE team_invitations SET status = 'cancelled', responded_at = NOW() WHERE user_id = $1 AND status = 'pending' AND team_id IN (SELECT id FROM teams WHERE event_id = $2) AND team_id <> $3`, [userId, eventId, teamId]);
      }
      return teamId;
    });
  } catch (err) {
    if (nameTaken(err)) throw conflict('A team with that name already exists in this event', { name: 'That team name is taken' });
    throw err;
  }
}

export async function update(teamId, userId, data) {
  try {
    await transaction(async (run) => {
      const team = (await run(`SELECT id, event_id AS "eventId", leader_id AS "leaderId" FROM teams WHERE id = $1 FOR UPDATE`, [teamId]))[0];
      if (!team) throw notFound('Team not found');
      if (team.leaderId !== userId) throw conflict('Only the team leader can change team details');
      assertTeamsOpen(await lockEvent(run, team.eventId));
      await run(
        `UPDATE teams SET name = $2, project_title = $3, project_description = $4,
                          repository_url = $5, demo_url = $6, updated_at = NOW() WHERE id = $1`,
        [teamId, data.name, data.projectTitle, data.projectDescription, data.repositoryUrl ?? '', data.demoUrl ?? ''],
      );
      await replaceTeamSkills(run, teamId, data.skills);
    });
  } catch (err) {
    if (nameTaken(err)) throw conflict('A team with that name already exists in this event', { name: 'That team name is taken' });
    throw err;
  }
}

/** Start an invitation (leader -> person) or a join request (person -> leader). */
async function openInvitation(teamId, actorId, targetUserId, kind) {
  return transaction(async (run) => {
    const team = (await run(`SELECT id, event_id AS "eventId", leader_id AS "leaderId", name FROM teams WHERE id = $1 FOR UPDATE`, [teamId]))[0];
    if (!team) throw notFound('Team not found');
    const event = await lockEvent(run, team.eventId);
    assertTeamsOpen(event);

    if (kind === 'invite' && team.leaderId !== actorId) throw conflict('Only the team leader can invite people');
    const who = kind === 'invite' ? 'That person' : 'You';
    await assertHasSeat(run, event.id, targetUserId, who);
    await assertCanJoin(run, event, targetUserId, who);
    await assertNotJudging(run, teamId, targetUserId, who);

    if ((await run(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, targetUserId]))[0]) {
      throw conflict(`${who} ${who === 'You' ? 'are' : 'is'} already in this team`);
    }
    const size = (await run(`SELECT COUNT(*)::int AS n FROM team_members WHERE team_id = $1`, [teamId]))[0].n;
    if (size >= event.maxTeamSize) throw conflict('This team is already full');

    const rows = await run(
      `INSERT INTO team_invitations (team_id, user_id, kind, created_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (team_id, user_id) WHERE status = 'pending' DO NOTHING RETURNING id`,
      [teamId, targetUserId, kind, actorId],
    );
    if (!rows[0]) throw conflict(kind === 'invite' ? 'That person already has a pending invitation or request' : 'You already have a pending invitation or request for this team');
    return { id: rows[0].id, teamId, eventId: team.eventId, teamName: team.name, leaderId: team.leaderId };
  });
}

export const invite = (teamId, leaderId, userId) => openInvitation(teamId, leaderId, userId, 'invite');
export const requestToJoin = (teamId, userId) => openInvitation(teamId, userId, userId, 'request');

/**
 * Accept or reject. An invitation is answered by the invitee; a join request by the team leader.
 * Accepting re-checks every rule at that moment (size, one-team-per-event, seats).
 */
export async function respond(invitationId, actorId, accept) {
  return transaction(async (run) => {
    const inv = (await run(
      `SELECT i.id, i.team_id AS "teamId", i.user_id AS "userId", i.kind, i.status, t.event_id AS "eventId",
              t.leader_id AS "leaderId", t.name AS "teamName"
         FROM team_invitations i JOIN teams t ON t.id = i.team_id WHERE i.id = $1 FOR UPDATE OF i`,
      [invitationId],
    ))[0];
    if (!inv) throw notFound('Invitation not found');
    const answerer = inv.kind === 'invite' ? inv.userId : inv.leaderId;
    if (actorId !== answerer) throw notFound('Invitation not found');
    if (inv.status !== 'pending') throw conflict(`This ${inv.kind === 'invite' ? 'invitation' : 'request'} was already ${inv.status}`);

    const event = await lockEvent(run, inv.eventId);
    if (!accept) {
      await run(`UPDATE team_invitations SET status = 'rejected', responded_at = NOW() WHERE id = $1`, [invitationId]);
      return { ...inv, accepted: false };
    }

    assertTeamsOpen(event);
    await assertHasSeat(run, event.id, inv.userId, 'That person');
    await assertCanJoin(run, event, inv.userId, inv.kind === 'invite' ? 'You' : 'That person');
    await assertNotJudging(run, inv.teamId, inv.userId, inv.kind === 'invite' ? 'You' : 'That person');
    const size = (await run(`SELECT COUNT(*)::int AS n FROM team_members WHERE team_id = $1`, [inv.teamId]))[0].n;
    if (size >= event.maxTeamSize) throw conflict('This team is already full');

    await run(`INSERT INTO team_members (team_id, user_id, event_id, role) VALUES ($1, $2, $3, 'member')`, [inv.teamId, inv.userId, inv.eventId]);
    await run(`UPDATE team_invitations SET status = 'accepted', responded_at = NOW() WHERE id = $1`, [invitationId]);
    if (!event.allowMultipleTeams) {
      // They are placed; their other open invitations and requests for this event no longer apply.
      await run(
        `UPDATE team_invitations SET status = 'cancelled', responded_at = NOW()
          WHERE user_id = $1 AND status = 'pending' AND team_id IN (SELECT id FROM teams WHERE event_id = $2)`,
        [inv.userId, inv.eventId],
      );
    }
    // A team that is now full needs no more open invitations.
    if (size + 1 >= event.maxTeamSize) {
      await run(`UPDATE team_invitations SET status = 'cancelled', responded_at = NOW() WHERE team_id = $1 AND status = 'pending'`, [inv.teamId]);
    }
    return { ...inv, accepted: true };
  });
}

/** The person who started an invitation/request withdraws it. */
export async function cancelInvitation(invitationId, actorId) {
  const rows = await query(
    `UPDATE team_invitations SET status = 'cancelled', responded_at = NOW()
      WHERE id = $1 AND created_by = $2 AND status = 'pending' RETURNING id`,
    [invitationId, actorId],
  );
  if (!rows[0]) throw notFound('Open invitation not found');
}

/** Remove a member. If the leader goes, leadership passes to the longest-standing member; the last one out closes the team. */
async function removeFromTeam(run, team, userId) {
  await run(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [team.id, userId]);
  const rest = await run(`SELECT user_id AS "userId" FROM team_members WHERE team_id = $1 ORDER BY joined_at, user_id`, [team.id]);
  if (rest.length === 0) {
    await run(`DELETE FROM teams WHERE id = $1`, [team.id]);
    return { disbanded: true, newLeaderId: null };
  }
  if (team.leaderId === userId) {
    const next = rest[0].userId;
    await run(`UPDATE teams SET leader_id = $2, updated_at = NOW() WHERE id = $1`, [team.id, next]);
    await run(`UPDATE team_members SET role = 'leader' WHERE team_id = $1 AND user_id = $2`, [team.id, next]);
    return { disbanded: false, newLeaderId: next };
  }
  return { disbanded: false, newLeaderId: null };
}

export async function leave(teamId, userId) {
  return transaction(async (run) => {
    const team = (await run(`SELECT id, event_id AS "eventId", leader_id AS "leaderId", name FROM teams WHERE id = $1 FOR UPDATE`, [teamId]))[0];
    if (!team) throw notFound('Team not found');
    const event = await lockEvent(run, team.eventId);
    if (getEventStatus(event) === 'ended') throw conflict('This event has ended, so teams can no longer change');
    if (!(await run(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]))[0]) throw conflict('You are not in this team');
    return { ...team, ...(await removeFromTeam(run, team, userId)) };
  });
}

export async function removeMember(teamId, leaderId, userId) {
  return transaction(async (run) => {
    const team = (await run(`SELECT id, event_id AS "eventId", leader_id AS "leaderId", name FROM teams WHERE id = $1 FOR UPDATE`, [teamId]))[0];
    if (!team) throw notFound('Team not found');
    if (team.leaderId !== leaderId) throw conflict('Only the team leader can remove members');
    if (userId === leaderId) throw conflict('Use "Leave team" to step down');
    assertTeamsOpen(await lockEvent(run, team.eventId));
    if (!(await run(`SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]))[0]) throw notFound('That person is not in this team');
    return { ...team, ...(await removeFromTeam(run, team, userId)) };
  });
}

/** The leader (or the event's organizer) disbands the whole team. */
/** The leader marks the project as ready for judges. It needs a title and a description. */
export async function submitProject(teamId, userId) {
  return transaction(async (run) => {
    const team = (await run(
      `SELECT id, event_id AS "eventId", leader_id AS "leaderId", project_title AS title, project_description AS description FROM teams WHERE id = $1 FOR UPDATE`,
      [teamId],
    ))[0];
    if (!team) throw notFound('Team not found');
    if (team.leaderId !== userId) throw conflict('Only the team leader can submit the project');
    assertTeamsOpen(await lockEvent(run, team.eventId));
    if (!team.title.trim() || !team.description.trim()) {
      throw unprocessable('Add a project title and description before submitting', { projectTitle: 'Project title and description are required' });
    }
    await run(`UPDATE teams SET submitted_at = COALESCE(submitted_at, NOW()), updated_at = NOW() WHERE id = $1`, [teamId]);
  });
}

export async function disband(teamId, actor) {
  return transaction(async (run) => {
    const team = (await run(`SELECT id, event_id AS "eventId", leader_id AS "leaderId", name FROM teams WHERE id = $1 FOR UPDATE`, [teamId]))[0];
    if (!team) throw notFound('Team not found');
    const event = await lockEvent(run, team.eventId);
    if (actor.id !== team.leaderId && actor.id !== event.organizerId) throw notFound('Team not found');
    const members = await run(`SELECT user_id AS "userId" FROM team_members WHERE team_id = $1`, [teamId]);
    await run(`DELETE FROM teams WHERE id = $1`, [teamId]);
    return { ...team, memberIds: members.map((m) => m.userId) };
  });
}

/** Pending invitations to me, and join requests I have made, across events. */
export async function invitationsFor(userId) {
  return query(
    `SELECT i.id, i.kind, i.created_at AS "createdAt", t.id AS "teamId", t.name AS "teamName",
            e.id AS "eventId", e.name AS "eventName", u.name AS "fromName"
       FROM team_invitations i
       JOIN teams t ON t.id = i.team_id
       JOIN events e ON e.id = t.event_id
       LEFT JOIN users u ON u.id = i.created_by
      WHERE i.user_id = $1 AND i.status = 'pending'
      ORDER BY i.created_at DESC`,
    [userId],
  );
}

/** What a team leader sees: people asking to join, and people they invited. */
export async function openInvitationsForTeam(teamId) {
  return query(
    `SELECT i.id, i.kind, i.created_at AS "createdAt", u.id AS "userId", u.name, u.department, u.college,
            COALESCE((SELECT array_agg(s.skill ORDER BY s.skill) FROM user_skills s WHERE s.user_id = u.id), '{}') AS skills
       FROM team_invitations i JOIN users u ON u.id = i.user_id
      WHERE i.team_id = $1 AND i.status = 'pending' ORDER BY i.created_at`,
    [teamId],
  );
}

/**
 * Registered participants who would fit a team's needs, best first.
 * `extraSkill` lets the leader ask for one specific skill instead of the team's saved needs.
 */
export async function suggestions(team, event, extraSkill) {
  const needed = extraSkill ? [extraSkill] : team.skills;
  if (needed.length === 0) return [];

  const rows = await query(
    `SELECT u.id AS "userId", u.name, u.department, u.college,
            COALESCE((SELECT array_agg(s.skill ORDER BY s.skill) FROM user_skills s WHERE s.user_id = u.id), '{}') AS skills
       FROM registrations r JOIN users u ON u.id = r.user_id
      WHERE r.event_id = $1 AND r.status = ANY($2)
        AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = $3 AND m.user_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM team_invitations i WHERE i.team_id = $3 AND i.user_id = u.id AND i.status = 'pending')
        AND ($4 OR NOT EXISTS (SELECT 1 FROM team_members m WHERE m.event_id = $1 AND m.user_id = u.id))`,
    [event.id, ACTIVE, team.id, event.allowMultipleTeams],
  );

  return rows
    .map((person) => ({ ...person, ...scoreSkills(needed, person.skills) }))
    .filter((person) => person.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 10);
}

/** Organizer's view: every team plus registered participants who have no team yet. */
export async function overview(event) {
  const teams = await listForEvent(event, null);
  const unassigned = await query(
    `SELECT u.id AS "userId", u.name, u.email, u.department, u.college
       FROM registrations r JOIN users u ON u.id = r.user_id
      WHERE r.event_id = $1 AND r.status = ANY($2)
        AND NOT EXISTS (SELECT 1 FROM team_members m WHERE m.event_id = $1 AND m.user_id = u.id)
      ORDER BY u.name`,
    [event.id, ACTIVE],
  );
  return { teams, unassigned };
}

export async function updateSettings(eventId, settings) {
  return transaction(async (run) => {
    await lockEvent(run, eventId);
    const biggest = (await run(
      `SELECT COALESCE(MAX(n), 0)::int AS n FROM (SELECT COUNT(*) AS n FROM team_members WHERE event_id = $1 GROUP BY team_id) sizes`,
      [eventId],
    ))[0].n;
    if (settings.teamEnabled && settings.maxTeamSize < biggest) {
      throw unprocessable('Please fix the highlighted fields', { maxTeamSize: `A team already has ${biggest} members` });
    }
    if (!settings.allowMultipleTeams) {
      const doubled = (await run(
        `SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM team_members WHERE event_id = $1 GROUP BY user_id HAVING COUNT(*) > 1) d`,
        [eventId],
      ))[0].n;
      if (doubled) throw conflict(`${doubled} participant${doubled === 1 ? ' is' : 's are'} already in more than one team, so multiple teams cannot be switched off`);
    }
    await run(
      `UPDATE events SET team_enabled = $2, min_team_size = $3, max_team_size = $4, allow_multiple_teams = $5 WHERE id = $1`,
      [eventId, settings.teamEnabled, settings.minTeamSize, settings.maxTeamSize, settings.allowMultipleTeams],
    );
  });
}
