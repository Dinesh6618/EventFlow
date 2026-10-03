import { ROLES } from '../constants.js';
import * as events from '../models/eventModel.js';
import * as notifications from '../models/notificationModel.js';
import * as registrations from '../models/registrationModel.js';
import * as teams from '../models/teamModel.js';
import * as users from '../models/userModel.js';
import { appLink, queueEmail } from '../services/email/index.js';
import { requireEventAccess } from '../services/access.js';
import { forbidden, notFound } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

const hasSeat = async (eventId, userId) => {
  const reg = await registrations.findForUser(eventId, userId);
  return Boolean(reg && registrations.ACTIVE.includes(reg.status));
};

/** Team data is visible to the event's organizer and to people holding a seat. */
async function loadEventForReading(user, eventId) {
  const event = await events.findById(eventId);
  if (!event) throw notFound('Event not found');
  const isOwner = user.role === ROLES.ORGANIZER && event.organizerId === user.id;
  if (!isOwner && !(user.role === ROLES.PARTICIPANT && (await hasSeat(eventId, user.id)))) {
    try {
      await requireEventAccess(user, eventId, ['volunteer', 'judge']);
    } catch {
      throw forbidden('Teams are visible to people registered for this event');
    }
  }
  return { event, isOwner };
}

async function loadTeam(user, teamId) {
  const team = await teams.findById(teamId);
  if (!team) throw notFound('Team not found');
  const { event, isOwner } = await loadEventForReading(user, team.eventId);
  return { team, event, isOwner };
}

const tell = (userId, eventId, payload) =>
  notifications.safely(() => notifications.notify(userId, { eventId, link: `/events/${eventId}`, ...payload }));

export async function list(req, res) {
  const { event } = await loadEventForReading(req.user, idParam(req.params.id, 'Event'));
  const mine = req.user.role === ROLES.PARTICIPANT ? req.user.id : null;
  const list = await teams.listForEvent(event, mine);
  // Teams that fit my skills first, then newest.
  list.sort((a, b) => b.matchScore - a.matchScore || a.id - b.id);
  res.json({
    teams: list,
    rules: {
      enabled: event.teamEnabled,
      minTeamSize: event.minTeamSize,
      maxTeamSize: event.maxTeamSize,
      allowMultipleTeams: event.allowMultipleTeams,
    },
  });
}

export async function create(req, res) {
  const eventId = idParam(req.params.id, 'Event');
  const id = await teams.create(eventId, req.user.id, req.body);
  res.status(201).json({ team: await teams.findById(id) });
}

export async function detail(req, res) {
  const { team, event, isOwner } = await loadTeam(req.user, idParam(req.params.teamId, 'Team'));
  const body = { team: { ...team, minSize: event.minTeamSize, maxSize: event.maxTeamSize } };
  // Invitations and requests are for the leader (and organizer) only.
  if (isOwner || team.leaderId === req.user.id) body.invitations = await teams.openInvitationsForTeam(team.id);
  res.json(body);
}

export async function update(req, res) {
  const teamId = idParam(req.params.teamId, 'Team');
  await teams.update(teamId, req.user.id, req.body);
  res.json({ team: await teams.findById(teamId) });
}

export async function submitProject(req, res) {
  const teamId = idParam(req.params.teamId, 'Team');
  await teams.submitProject(teamId, req.user.id);
  res.json({ team: await teams.findById(teamId) });
}

export async function disband(req, res) {
  const result = await teams.disband(idParam(req.params.teamId, 'Team'), req.user);
  await Promise.all(
    result.memberIds
      .filter((id) => id !== req.user.id)
      .map((id) => tell(id, result.eventId, { type: 'team_response', title: 'Team disbanded', message: `The team "${result.name}" was disbanded.` })),
  );
  res.status(204).end();
}

export async function requestToJoin(req, res) {
  const result = await teams.requestToJoin(idParam(req.params.teamId, 'Team'), req.user.id);
  await tell(result.leaderId, result.eventId, {
    type: 'team_request',
    title: 'New join request',
    message: `${req.user.name} asked to join your team "${result.teamName}".`,
  });
  res.status(201).json({ invitation: { id: result.id, kind: 'request' } });
}

/** The same invitation, by email, for people who are not looking at the app. */
async function inviteByEmail(userId, inviterName, result) {
  const [person, event] = await Promise.all([users.findById(userId), events.findById(result.eventId)]);
  if (!person || !event) return;
  await queueEmail({
    to: person.email, template: 'teamInvitation', userId: person.id, category: 'team',
    data: { name: person.name, teamName: result.teamName, eventName: event.name, inviterName, url: appLink(`/events/${event.id}`) },
  });
}

export async function invite(req, res) {
  const result = await teams.invite(idParam(req.params.teamId, 'Team'), req.user.id, req.body.userId);
  inviteByEmail(req.body.userId, req.user.name, result).catch((err) => console.error('Team invitation email failed:', err.message));
  await tell(req.body.userId, result.eventId, {
    type: 'team_invitation',
    title: 'Team invitation',
    message: `${req.user.name} invited you to join the team "${result.teamName}".`,
  });
  res.status(201).json({ invitation: { id: result.id, kind: 'invite' } });
}

export async function respond(req, res) {
  const result = await teams.respond(idParam(req.params.id, 'Invitation'), req.user.id, req.body.accept);
  const verdict = req.body.accept ? 'accepted' : 'declined';
  if (result.kind === 'invite') {
    await tell(result.leaderId, result.eventId, {
      type: 'team_response',
      title: `Invitation ${verdict}`,
      message: `${req.user.name} ${verdict} your invitation to "${result.teamName}".`,
    });
  } else {
    await tell(result.userId, result.eventId, {
      type: 'team_response',
      title: `Join request ${verdict}`,
      message: `Your request to join "${result.teamName}" was ${verdict}.`,
    });
  }
  res.json({ accepted: result.accepted, teamId: result.teamId });
}

export async function cancelInvitation(req, res) {
  await teams.cancelInvitation(idParam(req.params.id, 'Invitation'), req.user.id);
  res.status(204).end();
}

export async function leave(req, res) {
  const result = await teams.leave(idParam(req.params.teamId, 'Team'), req.user.id);
  if (result.newLeaderId) {
    await tell(result.newLeaderId, result.eventId, {
      type: 'team_response',
      title: 'You are now team leader',
      message: `${req.user.name} left "${result.name}", so you are now its leader.`,
    });
  }
  res.json({ disbanded: result.disbanded });
}

export async function removeMember(req, res) {
  const userId = idParam(req.params.userId, 'Member');
  const result = await teams.removeMember(idParam(req.params.teamId, 'Team'), req.user.id, userId);
  await tell(userId, result.eventId, {
    type: 'team_response',
    title: 'Removed from team',
    message: `You were removed from the team "${result.name}".`,
  });
  res.status(204).end();
}

/** Skill-based teammate suggestions, for the team's leader or the event's organizer. */
export async function suggestions(req, res) {
  const { team, event, isOwner } = await loadTeam(req.user, idParam(req.params.teamId, 'Team'));
  if (!isOwner && team.leaderId !== req.user.id) throw forbidden('Only the team leader can see suggestions');
  res.json({
    needed: req.query.skill ? [req.query.skill] : team.skills,
    suggestions: await teams.suggestions(team, event, req.query.skill),
  });
}

export async function myInvitations(req, res) {
  res.json({ invitations: await teams.invitationsFor(req.user.id) });
}

/** Organizer: every team plus participants still without one. */
export async function overview(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  res.json(await teams.overview(event));
}

export async function updateSettings(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);
  await teams.updateSettings(event.id, req.body);
  const updated = await events.findById(event.id);
  res.json({
    rules: {
      enabled: updated.teamEnabled,
      minTeamSize: updated.minTeamSize,
      maxTeamSize: updated.maxTeamSize,
      allowMultipleTeams: updated.allowMultipleTeams,
    },
  });
}
