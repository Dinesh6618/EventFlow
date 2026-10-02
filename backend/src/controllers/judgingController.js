import { query } from '../db.js';
import * as judging from '../models/judgingModel.js';
import * as notifications from '../models/notificationModel.js';
import { requireEventAccess, requireEventViewer } from '../services/access.js';
import { idParam } from '../utils/params.js';

const organizerOf = (req) => requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['organizer']);

/* ------------------------------------------------------------ organizer */

export async function listCriteria(req, res) {
  const { event } = await requireEventViewer(req.user, idParam(req.params.id, 'Event'));
  const criteria = await judging.listCriteria(event.id);
  res.json({ criteria, maxTotal: judging.totalMax(criteria) });
}

export async function createCriterion(req, res) {
  const { event } = await organizerOf(req);
  res.status(201).json({ criterion: await judging.createCriterion(event.id, req.body) });
}

export async function updateCriterion(req, res) {
  const { event } = await organizerOf(req);
  res.json({ criterion: await judging.updateCriterion(event.id, idParam(req.params.criterionId, 'Criterion'), req.body) });
}

export async function removeCriterion(req, res) {
  const { event } = await organizerOf(req);
  await judging.removeCriterion(event.id, idParam(req.params.criterionId, 'Criterion'));
  res.status(204).end();
}

export async function assignments(req, res) {
  const { event } = await organizerOf(req);
  res.json(await judging.judgesWithAssignments(event.id));
}

export async function setAssignments(req, res) {
  const { event } = await organizerOf(req);
  const judgeId = idParam(req.params.judgeId, 'Judge');
  await judging.setAssignments(event.id, judgeId, req.body.teamIds);
  await notifications.safely(() =>
    notifications.notify(judgeId, {
      eventId: event.id,
      type: 'judging_assignment',
      title: 'Teams assigned to you',
      message: `You have been assigned teams to judge at ${event.name}.`,
      link: `/judging/events/${event.id}`,
    }),
  );
  res.json(await judging.judgesWithAssignments(event.id));
}

export async function autoAssign(req, res) {
  const { event } = await organizerOf(req);
  const added = await judging.autoAssign(event.id, req.body.judgesPerTeam);
  res.json({ added, ...(await judging.judgesWithAssignments(event.id)) });
}

export async function progress(req, res) {
  const { event } = await organizerOf(req);
  res.json({ settings: { leaderboardPublished: event.leaderboardPublished, shareJudgeComments: event.shareJudgeComments }, ...(await judging.progress(event.id)) });
}

export async function unlock(req, res) {
  const { event } = await organizerOf(req);
  const { judgeId, teamId } = await judging.unlock(event.id, idParam(req.params.evaluationId, 'Evaluation'));
  await notifications.safely(() =>
    notifications.notify(judgeId, {
      eventId: event.id,
      type: 'judging_unlocked',
      title: 'You can edit an evaluation',
      message: `The organizer unlocked one of your submitted evaluations at ${event.name}. Re-submit it when you are done.`,
      link: `/judging/events/${event.id}/teams/${teamId}`,
    }),
  );
  res.json({ ok: true });
}

export async function updateSettings(req, res) {
  const { event } = await organizerOf(req);
  await judging.updateSettings(event.id, req.body);
  if (req.body.leaderboardPublished && !event.leaderboardPublished) {
    await notifications.safely(() =>
      notifications.notifyEvent(event.id, {
        type: 'leaderboard_published',
        title: 'Leaderboard published',
        message: `The results for ${event.name} are now available.`,
        link: `/events/${event.id}`,
      }),
    );
  }
  res.json({ settings: req.body });
}

/* ----------------------------------------------------------------- judge */

export async function myJudging(req, res) {
  res.json({ events: await judging.judgingEventsFor(req.user.id) });
}

export async function myTeams(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['judge']);
  const [teams, criteria] = await Promise.all([judging.assignedTeams(event.id, req.user.id), judging.listCriteria(event.id)]);
  res.json({ event: { id: event.id, name: event.name, status: event.status }, teams, criteria, maxTotal: judging.totalMax(criteria) });
}

export async function teamDetail(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['judge']);
  const detail = await judging.teamForJudge(event.id, idParam(req.params.teamId, 'Team'), req.user.id);
  res.json({ ...detail, maxTotal: judging.totalMax(detail.criteria) });
}

export async function saveEvaluation(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['judge']);
  await judging.saveDraft(event.id, idParam(req.params.teamId, 'Team'), req.user.id, req.body);
  res.json({ status: 'draft' });
}

export async function submitEvaluation(req, res) {
  const { event } = await requireEventAccess(req.user, idParam(req.params.id, 'Event'), ['judge']);
  await judging.submit(event.id, idParam(req.params.teamId, 'Team'), req.user.id, req.body);
  res.json({ status: 'submitted' });
}

/* ----------------------------------------------------------- leaderboard */

/**
 * The organizer always sees the full board. Everyone else sees it only after it is published,
 * with just rank, team, score and status. Judges' comments reach a team only if the organizer allows it.
 */
export async function leaderboard(req, res) {
  const { event, capacity } = await requireEventViewer(req.user, idParam(req.params.id, 'Event'));

  if (capacity === 'organizer') {
    const board = await judging.leaderboard(event.id, { detail: true });
    return res.json({ published: event.leaderboardPublished, shareJudgeComments: event.shareJudgeComments, ...board });
  }
  if (!event.leaderboardPublished) return res.json({ published: false, rows: [] });

  const board = await judging.leaderboard(event.id);
  const body = {
    published: true,
    maxScore: board.maxScore,
    rows: board.rows.map(({ rank, team, teamId, score, status }) => ({ rank, team, teamId, score, status })),
  };
  if (capacity === 'participant') {
    const mine = await query(`SELECT team_id AS "teamId" FROM team_members WHERE event_id = $1 AND user_id = $2`, [event.id, req.user.id]);
    body.myTeamIds = mine.map((m) => m.teamId);
    if (event.shareJudgeComments) body.feedback = await Promise.all(
      mine.map(async ({ teamId }) => ({
        teamId,
        comments: await judging.sharedFeedbackForTeam(event.id, teamId),
      })),
    );
  }
  res.json(body);
}
