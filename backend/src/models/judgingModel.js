import { query, transaction } from '../db.js';
import { conflict, notFound, unprocessable } from '../utils/httpError.js';

const round2 = (n) => Math.round(n * 100) / 100;

/* ---------------------------------------------------------------- criteria */

const CRITERIA_SELECT = `
  SELECT c.id, c.event_id AS "eventId", c.name, c.description, c.max_score AS "maxScore", c.position
    FROM evaluation_criteria c`;

export async function listCriteria(eventId) {
  return query(`${CRITERIA_SELECT} WHERE c.event_id = $1 ORDER BY c.position, c.id`, [eventId]);
}

export const totalMax = (criteria) => criteria.reduce((sum, c) => sum + c.maxScore, 0);

const nameTaken = (err) => err.code === '23505' && /evaluation_criteria_name_idx/.test(`${err.constraint ?? ''}${err.message}`);

async function hasScores(eventId) {
  const rows = await query(
    `SELECT 1 FROM evaluation_scores s JOIN evaluations e ON e.id = s.evaluation_id WHERE e.event_id = $1 LIMIT 1`,
    [eventId],
  );
  return rows.length > 0;
}

export async function createCriterion(eventId, data) {
  if (await hasScores(eventId)) throw conflict('Judges have already started scoring, so criteria can no longer be added');
  try {
    const next = (await query(`SELECT COALESCE(MAX(position), 0) + 1 AS n FROM evaluation_criteria WHERE event_id = $1`, [eventId]))[0].n;
    const rows = await query(
      `INSERT INTO evaluation_criteria (event_id, name, description, max_score, position) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [eventId, data.name, data.description, data.maxScore, next],
    );
    return (await query(`${CRITERIA_SELECT} WHERE c.id = $1`, [rows[0].id]))[0];
  } catch (err) {
    if (nameTaken(err)) throw conflict('That criterion already exists', { name: 'A criterion with this name already exists' });
    throw err;
  }
}

export async function updateCriterion(eventId, id, data) {
  const current = (await query(`${CRITERIA_SELECT} WHERE c.id = $1 AND c.event_id = $2`, [id, eventId]))[0];
  if (!current) throw notFound('Criterion not found');
  if (current.maxScore !== data.maxScore && (await hasScores(eventId))) {
    throw conflict('Judges have already started scoring, so the maximum score can no longer change', {
      maxScore: 'Scoring has started: the maximum is locked',
    });
  }
  try {
    await query(`UPDATE evaluation_criteria SET name = $3, description = $4, max_score = $5 WHERE id = $1 AND event_id = $2`, [
      id, eventId, data.name, data.description, data.maxScore,
    ]);
  } catch (err) {
    if (nameTaken(err)) throw conflict('That criterion already exists', { name: 'A criterion with this name already exists' });
    throw err;
  }
  return (await query(`${CRITERIA_SELECT} WHERE c.id = $1`, [id]))[0];
}

export async function removeCriterion(eventId, id) {
  if (await hasScores(eventId)) throw conflict('Judges have already started scoring, so criteria can no longer be removed');
  const rows = await query(`DELETE FROM evaluation_criteria WHERE id = $1 AND event_id = $2 RETURNING id`, [id, eventId]);
  if (!rows[0]) throw notFound('Criterion not found');
}

/* ------------------------------------------------------------- assignments */

/** Judges of the event with the teams assigned to each. */
export async function judgesWithAssignments(eventId) {
  const [judges, assignments, teams] = await Promise.all([
    query(
      `SELECT s.id AS "staffId", u.id AS "userId", u.name, u.email
         FROM event_staff s JOIN users u ON u.id = s.user_id
        WHERE s.event_id = $1 AND s.staff_role = 'judge' ORDER BY u.name`,
      [eventId],
    ),
    query(`SELECT judge_id AS "judgeId", team_id AS "teamId" FROM judge_assignments WHERE event_id = $1`, [eventId]),
    query(`SELECT id, name FROM teams WHERE event_id = $1 ORDER BY name`, [eventId]),
  ]);
  return {
    teams,
    judges: judges.map((j) => ({ ...j, teamIds: assignments.filter((a) => a.judgeId === j.userId).map((a) => a.teamId) })),
  };
}

/** Replace the set of teams one judge scores. Teams they have already submitted for cannot be removed. */
export async function setAssignments(eventId, judgeId, teamIds) {
  return transaction(async (run) => {
    const isJudge = (await run(`SELECT 1 FROM event_staff WHERE event_id = $1 AND user_id = $2 AND staff_role = 'judge'`, [eventId, judgeId]))[0];
    if (!isJudge) throw notFound('That person is not a judge for this event');

    const wanted = [...new Set(teamIds)];
    if (wanted.length) {
      const valid = await run(`SELECT id FROM teams WHERE event_id = $1 AND id = ANY($2)`, [eventId, wanted]);
      if (valid.length !== wanted.length) throw unprocessable('Some teams do not belong to this event', { teamIds: 'Unknown team' });
      const conflicts = await run(
        `SELECT t.name FROM team_members m JOIN teams t ON t.id = m.team_id WHERE m.user_id = $1 AND m.team_id = ANY($2)`,
        [judgeId, wanted],
      );
      if (conflicts[0]) throw conflict(`A judge cannot score a team they belong to (${conflicts[0].name})`);
    }

    const locked = await run(
      `SELECT t.name FROM evaluations ev JOIN teams t ON t.id = ev.team_id
        WHERE ev.event_id = $1 AND ev.judge_id = $2 AND ev.status = 'submitted' AND NOT (ev.team_id = ANY($3))`,
      [eventId, judgeId, wanted],
    );
    if (locked[0]) throw conflict(`This judge already submitted a score for ${locked[0].name}, so it cannot be unassigned`);

    await run(`DELETE FROM judge_assignments WHERE event_id = $1 AND judge_id = $2 AND NOT (team_id = ANY($3))`, [eventId, judgeId, wanted]);
    for (const teamId of wanted) {
      await run(
        `INSERT INTO judge_assignments (judge_id, team_id, event_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [judgeId, teamId, eventId],
      );
    }
    // Drafts for teams that are no longer assigned are meaningless.
    await run(
      `DELETE FROM evaluations WHERE event_id = $1 AND judge_id = $2 AND status = 'draft' AND NOT (team_id = ANY($3))`,
      [eventId, judgeId, wanted],
    );
  });
}

/** Give every team `perTeam` judges, always picking the judges with the lightest load. Existing assignments stay. */
export async function autoAssign(eventId, perTeam) {
  return transaction(async (run) => {
    const judges = await run(`SELECT user_id AS id FROM event_staff WHERE event_id = $1 AND staff_role = 'judge'`, [eventId]);
    const teams = await run(`SELECT id FROM teams WHERE event_id = $1 ORDER BY id`, [eventId]);
    if (judges.length === 0) throw conflict('Add at least one judge first');
    if (teams.length === 0) throw conflict('There are no teams to assign yet');
    if (perTeam > judges.length) throw unprocessable('Please fix the highlighted fields', { judgesPerTeam: `Only ${judges.length} judge${judges.length === 1 ? '' : 's'} available` });

    const existing = await run(`SELECT judge_id AS "judgeId", team_id AS "teamId" FROM judge_assignments WHERE event_id = $1`, [eventId]);
    const members = await run(`SELECT user_id AS "userId", team_id AS "teamId" FROM team_members WHERE event_id = $1`, [eventId]);
    const load = new Map(judges.map((j) => [j.id, existing.filter((a) => a.judgeId === j.id).length]));
    let added = 0;

    for (const team of teams) {
      const has = new Set(existing.filter((a) => a.teamId === team.id).map((a) => a.judgeId));
      const blocked = new Set(members.filter((m) => m.teamId === team.id).map((m) => m.userId));
      const pool = judges.filter((j) => !has.has(j.id) && !blocked.has(j.id)).sort((a, b) => load.get(a.id) - load.get(b.id) || a.id - b.id);
      for (const judge of pool.slice(0, Math.max(perTeam - has.size, 0))) {
        await run(`INSERT INTO judge_assignments (judge_id, team_id, event_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [judge.id, team.id, eventId]);
        load.set(judge.id, load.get(judge.id) + 1);
        added += 1;
      }
    }
    return added;
  });
}

/* ------------------------------------------------------------ judge's view */

/** Events where the user is a judge, with how far along they are. */
export async function judgingEventsFor(userId) {
  return query(
    `SELECT e.id AS "eventId", e.name AS "eventName", to_char(e.date, 'YYYY-MM-DD') AS date,
            (SELECT COUNT(*)::int FROM judge_assignments a WHERE a.event_id = e.id AND a.judge_id = $1) AS assigned,
            (SELECT COUNT(*)::int FROM evaluations v WHERE v.event_id = e.id AND v.judge_id = $1 AND v.status = 'submitted') AS submitted
       FROM event_staff s JOIN events e ON e.id = s.event_id
      WHERE s.user_id = $1 AND s.staff_role = 'judge' ORDER BY e.date`,
    [userId],
  );
}

export async function assignedTeams(eventId, judgeId) {
  return query(
    `SELECT t.id, t.name, t.project_title AS "projectTitle", (t.submitted_at IS NOT NULL) AS submitted,
            COALESCE(v.status, 'not_started') AS "evaluationStatus", COALESCE(v.edit_unlocked, FALSE) AS "editUnlocked"
       FROM judge_assignments a
       JOIN teams t ON t.id = a.team_id
       LEFT JOIN evaluations v ON v.team_id = t.id AND v.judge_id = a.judge_id
      WHERE a.event_id = $1 AND a.judge_id = $2 ORDER BY t.name`,
    [eventId, judgeId],
  );
}

/** Project details plus this judge's own evaluation. Judges never see other judges' scores. */
export async function teamForJudge(eventId, teamId, judgeId) {
  const assigned = (await query(`SELECT 1 FROM judge_assignments WHERE event_id = $1 AND team_id = $2 AND judge_id = $3`, [eventId, teamId, judgeId]))[0];
  if (!assigned) throw notFound('This team is not assigned to you');

  const team = (await query(
    `SELECT t.id, t.name, t.project_title AS "projectTitle", t.project_description AS "projectDescription",
            t.repository_url AS "repositoryUrl", t.demo_url AS "demoUrl", t.submitted_at AS "submittedAt"
       FROM teams t WHERE t.id = $1`,
    [teamId],
  ))[0];
  team.members = await query(
    `SELECT u.name, m.role FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1 ORDER BY (m.role = 'leader') DESC, m.joined_at`,
    [teamId],
  );

  const evaluation = (await query(
    `SELECT id, status, comments, edit_unlocked AS "editUnlocked", submitted_at AS "submittedAt"
       FROM evaluations WHERE team_id = $1 AND judge_id = $2`,
    [teamId, judgeId],
  ))[0];
  let scores = {};
  if (evaluation) {
    const rows = await query(`SELECT criterion_id AS id, score::float8 AS score FROM evaluation_scores WHERE evaluation_id = $1`, [evaluation.id]);
    scores = Object.fromEntries(rows.map((r) => [r.id, r.score]));
  }
  return {
    team,
    criteria: await listCriteria(eventId),
    evaluation: evaluation ? { ...evaluation, scores } : { status: 'not_started', comments: '', editUnlocked: false, scores },
  };
}

/** Validate `scores` ({ criterionId: number }) against the criteria. Partial sets are fine for drafts. */
function checkScores(criteria, scores, { requireAll }) {
  const errors = {};
  const byId = new Map(criteria.map((c) => [String(c.id), c]));
  const clean = {};
  for (const [key, value] of Object.entries(scores ?? {})) {
    const criterion = byId.get(String(key));
    if (!criterion) {
      errors[key] = 'Unknown criterion';
      continue;
    }
    if (value === null || value === '' || value === undefined) continue;
    const n = Number(value);
    if (!Number.isFinite(n)) errors[key] = 'Enter a number';
    else if (n < 0 || n > criterion.maxScore) errors[key] = `Score must be between 0 and ${criterion.maxScore}`;
    else if (Math.round(n * 100) / 100 !== n) errors[key] = 'Use at most two decimal places';
    else clean[criterion.id] = n;
  }
  if (requireAll) {
    for (const c of criteria) if (clean[c.id] === undefined && !errors[c.id]) errors[c.id] = `Score ${c.name}`;
  }
  if (Object.keys(errors).length) throw unprocessable('Please fix the highlighted scores', errors);
  return clean;
}

/** Save a draft, or, if the organizer unlocked it, correct a submitted evaluation (it must then be re-submitted). */
export async function saveDraft(eventId, teamId, judgeId, { scores, comments }) {
  const criteria = await listCriteria(eventId);
  if (criteria.length === 0) throw conflict('The organizer has not set evaluation criteria yet');
  const clean = checkScores(criteria, scores, { requireAll: false });

  return transaction(async (run) => {
    if (!(await run(`SELECT 1 FROM judge_assignments WHERE event_id = $1 AND team_id = $2 AND judge_id = $3`, [eventId, teamId, judgeId]))[0]) {
      throw notFound('This team is not assigned to you');
    }
    await run(
      `INSERT INTO evaluations (event_id, team_id, judge_id, comments) VALUES ($1, $2, $3, $4) ON CONFLICT (team_id, judge_id) DO NOTHING`,
      [eventId, teamId, judgeId, comments ?? ''],
    );
    const ev = (await run(`SELECT id, status, edit_unlocked AS "editUnlocked" FROM evaluations WHERE team_id = $1 AND judge_id = $2 FOR UPDATE`, [teamId, judgeId]))[0];
    if (ev.status === 'submitted' && !ev.editUnlocked) {
      throw conflict('You already submitted this evaluation. Ask the organizer to unlock it if it needs a correction.');
    }
    await run(`UPDATE evaluations SET comments = $2, status = 'draft', updated_at = NOW() WHERE id = $1`, [ev.id, comments ?? '']);
    await run(`DELETE FROM evaluation_scores WHERE evaluation_id = $1`, [ev.id]);
    for (const [criterionId, score] of Object.entries(clean)) {
      await run(`INSERT INTO evaluation_scores (evaluation_id, criterion_id, score) VALUES ($1, $2, $3)`, [ev.id, Number(criterionId), score]);
    }
    return ev.id;
  });
}

export async function submit(eventId, teamId, judgeId, { scores, comments }) {
  const criteria = await listCriteria(eventId);
  if (criteria.length === 0) throw conflict('The organizer has not set evaluation criteria yet');
  const clean = checkScores(criteria, scores, { requireAll: true });

  return transaction(async (run) => {
    if (!(await run(`SELECT 1 FROM judge_assignments WHERE event_id = $1 AND team_id = $2 AND judge_id = $3`, [eventId, teamId, judgeId]))[0]) {
      throw notFound('This team is not assigned to you');
    }
    await run(
      `INSERT INTO evaluations (event_id, team_id, judge_id) VALUES ($1, $2, $3) ON CONFLICT (team_id, judge_id) DO NOTHING`,
      [eventId, teamId, judgeId],
    );
    const ev = (await run(`SELECT id, status, edit_unlocked AS "editUnlocked" FROM evaluations WHERE team_id = $1 AND judge_id = $2 FOR UPDATE`, [teamId, judgeId]))[0];
    if (ev.status === 'submitted' && !ev.editUnlocked) throw conflict('You already submitted this evaluation');

    await run(`DELETE FROM evaluation_scores WHERE evaluation_id = $1`, [ev.id]);
    for (const [criterionId, score] of Object.entries(clean)) {
      await run(`INSERT INTO evaluation_scores (evaluation_id, criterion_id, score) VALUES ($1, $2, $3)`, [ev.id, Number(criterionId), score]);
    }
    await run(
      `UPDATE evaluations SET status = 'submitted', comments = $2, edit_unlocked = FALSE, submitted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [ev.id, comments ?? ''],
    );
    return ev.id;
  });
}

/* --------------------------------------------------------- organizer views */

export async function unlock(eventId, evaluationId) {
  const rows = await query(
    `UPDATE evaluations SET edit_unlocked = TRUE, updated_at = NOW()
      WHERE id = $1 AND event_id = $2 AND status = 'submitted' RETURNING judge_id AS "judgeId", team_id AS "teamId"`,
    [evaluationId, eventId],
  );
  if (!rows[0]) throw conflict('Only a submitted evaluation can be unlocked');
  return rows[0];
}

/** How far along judging is, per judge, per team, and overall. */
export async function progress(eventId) {
  const [criteria, assignments, evaluations, teams, judges] = await Promise.all([
    listCriteria(eventId),
    query(`SELECT judge_id AS "judgeId", team_id AS "teamId" FROM judge_assignments WHERE event_id = $1`, [eventId]),
    query(
      `SELECT v.id, v.judge_id AS "judgeId", v.team_id AS "teamId", v.status, v.edit_unlocked AS "editUnlocked",
              v.comments, v.submitted_at AS "submittedAt",
              COALESCE((SELECT SUM(s.score) FROM evaluation_scores s WHERE s.evaluation_id = v.id), 0)::float8 AS total
         FROM evaluations v WHERE v.event_id = $1`,
      [eventId],
    ),
    query(`SELECT id, name FROM teams WHERE event_id = $1 ORDER BY name`, [eventId]),
    query(`SELECT u.id, u.name FROM event_staff s JOIN users u ON u.id = s.user_id WHERE s.event_id = $1 AND s.staff_role = 'judge' ORDER BY u.name`, [eventId]),
  ]);

  const evalOf = (judgeId, teamId) => evaluations.find((e) => e.judgeId === judgeId && e.teamId === teamId);
  const byJudge = judges.map((j) => {
    const mine = assignments.filter((a) => a.judgeId === j.id);
    return {
      judgeId: j.id,
      name: j.name,
      assigned: mine.length,
      submitted: mine.filter((a) => evalOf(j.id, a.teamId)?.status === 'submitted').length,
      drafts: mine.filter((a) => evalOf(j.id, a.teamId)?.status === 'draft').length,
    };
  });
  const rows = assignments.map((a) => {
    const ev = evalOf(a.judgeId, a.teamId);
    return {
      evaluationId: ev?.id ?? null,
      teamId: a.teamId,
      teamName: teams.find((t) => t.id === a.teamId)?.name,
      judgeId: a.judgeId,
      judgeName: judges.find((j) => j.id === a.judgeId)?.name,
      status: ev?.status ?? 'not_started',
      editUnlocked: ev?.editUnlocked ?? false,
      total: ev?.status === 'submitted' ? ev.total : null,
      comments: ev?.comments ?? '',
      submittedAt: ev?.submittedAt ?? null,
    };
  });
  const totalAssigned = assignments.length;
  const totalSubmitted = rows.filter((r) => r.status === 'submitted').length;
  return {
    criteria,
    maxTotal: totalMax(criteria),
    totalAssigned,
    totalSubmitted,
    percentage: totalAssigned ? round2((totalSubmitted / totalAssigned) * 100) : 0,
    byJudge,
    evaluations: rows,
    unassignedTeams: teams.filter((t) => !assignments.some((a) => a.teamId === t.id)),
  };
}

/* ------------------------------------------------------------- leaderboard */

/**
 * Teams ranked by the average of their submitted evaluations. Ties share a rank (1, 2, 2, 4).
 * `detail: true` (organizer) adds per-criterion averages and the judges' comments.
 */
export async function leaderboard(eventId, { detail = false } = {}) {
  const [criteria, teams, assignments, totals, perCriterion, comments] = await Promise.all([
    listCriteria(eventId),
    query(
      `SELECT t.id, t.name, t.project_title AS "projectTitle", (t.submitted_at IS NOT NULL) AS submitted,
              (SELECT COUNT(*)::int FROM team_members m WHERE m.team_id = t.id) AS members
         FROM teams t WHERE t.event_id = $1`,
      [eventId],
    ),
    query(`SELECT team_id AS "teamId", COUNT(*)::int AS n FROM judge_assignments WHERE event_id = $1 GROUP BY team_id`, [eventId]),
    query(
      `SELECT v.team_id AS "teamId", COUNT(*)::int AS n, AVG(t.total)::float8 AS avg
         FROM evaluations v
         JOIN (SELECT evaluation_id, SUM(score) AS total FROM evaluation_scores GROUP BY evaluation_id) t ON t.evaluation_id = v.id
        WHERE v.event_id = $1 AND v.status = 'submitted' GROUP BY v.team_id`,
      [eventId],
    ),
    detail
      ? query(
          `SELECT v.team_id AS "teamId", s.criterion_id AS "criterionId", AVG(s.score)::float8 AS avg
             FROM evaluation_scores s JOIN evaluations v ON v.id = s.evaluation_id
            WHERE v.event_id = $1 AND v.status = 'submitted' GROUP BY v.team_id, s.criterion_id`,
          [eventId],
        )
      : [],
    query(
      `SELECT v.team_id AS "teamId", v.comments, u.name AS "judgeName"
         FROM evaluations v JOIN users u ON u.id = v.judge_id
        WHERE v.event_id = $1 AND v.status = 'submitted' AND v.comments <> '' ORDER BY v.submitted_at`,
      [eventId],
    ),
  ]);

  const max = totalMax(criteria);
  const rows = teams.map((team) => {
    const t = totals.find((x) => x.teamId === team.id);
    const assigned = assignments.find((x) => x.teamId === team.id)?.n ?? 0;
    const submitted = t?.n ?? 0;
    const score = t ? round2(t.avg) : null;
    const status = submitted === 0 ? (assigned ? 'Awaiting scores' : 'Not assigned') : submitted >= assigned ? 'Final' : 'In progress';
    const row = {
      teamId: team.id,
      team: team.name,
      projectTitle: team.projectTitle,
      score,
      maxScore: max,
      percentage: score !== null && max ? round2((score / max) * 100) : null,
      evaluationsSubmitted: submitted,
      evaluationsAssigned: assigned,
      status,
    };
    if (detail) {
      row.criteria = criteria.map((c) => ({ id: c.id, name: c.name, maxScore: c.maxScore, average: round2(perCriterion.find((p) => p.teamId === team.id && p.criterionId === c.id)?.avg ?? 0) }));
      row.comments = comments.filter((c) => c.teamId === team.id).map(({ judgeName, comments: text }) => ({ judge: judgeName, comment: text }));
    }
    return row;
  });

  // Competition ranking over scored teams; unscored teams follow, unranked.
  const scored = rows.filter((r) => r.score !== null).sort((a, b) => b.score - a.score || a.team.localeCompare(b.team));
  scored.forEach((row, i) => {
    row.rank = i > 0 && scored[i - 1].score === row.score ? scored[i - 1].rank : i + 1;
  });
  const unscored = rows.filter((r) => r.score === null).map((r) => ({ ...r, rank: null })).sort((a, b) => a.team.localeCompare(b.team));
  return { criteria, maxScore: max, rows: [...scored, ...unscored] };
}

/** Judges' comments for one team, anonymised, for when the organizer chooses to share them. */
export async function sharedFeedbackForTeam(eventId, teamId) {
  const rows = await query(
    `SELECT comments FROM evaluations WHERE event_id = $1 AND team_id = $2 AND status = 'submitted' AND comments <> '' ORDER BY submitted_at`,
    [eventId, teamId],
  );
  return rows.map((r, i) => ({ judge: `Judge ${i + 1}`, comment: r.comments }));
}

export async function updateSettings(eventId, { leaderboardPublished, shareJudgeComments }) {
  await query(`UPDATE events SET leaderboard_published = $2, share_judge_comments = $3 WHERE id = $1`, [eventId, leaderboardPublished, shareJudgeComments]);
}
