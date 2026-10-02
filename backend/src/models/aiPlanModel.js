import { query } from '../db.js';
import { planWarnings } from '../services/ai/planSchema.js';
import { conflict, notFound } from '../utils/httpError.js';
import * as events from './eventModel.js';
import * as judging from './judgingModel.js';
import * as schedule from './scheduleModel.js';

const COLUMNS = `
  id, event_id AS "eventId", request, original_plan AS "originalPlan", plan, status, model,
  input_tokens AS "inputTokens", output_tokens AS "outputTokens",
  created_at AS "createdAt", updated_at AS "updatedAt", confirmed_at AS "confirmedAt", published_at AS "publishedAt"`;

const json = (value) => JSON.stringify(value);

export async function create(organizerId, { request, plan, model, usage }) {
  const rows = await query(
    `INSERT INTO ai_plans (organizer_id, request, original_plan, plan, model, input_tokens, output_tokens)
     VALUES ($1, $2::jsonb, $3::jsonb, $3::jsonb, $4, $5, $6) RETURNING id`,
    [organizerId, json(request), json(plan), model, usage.input, usage.output],
  );
  return find(organizerId, rows[0].id);
}

export async function list(organizerId) {
  return query(
    `SELECT id, status, event_id AS "eventId", plan->>'title' AS title, plan->>'eventType' AS "eventType",
            request->>'idea' AS idea, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM ai_plans WHERE organizer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`,
    [organizerId],
  );
}

/** A plan, only if it belongs to this organizer. */
export async function find(organizerId, id) {
  const rows = await query(`SELECT ${COLUMNS} FROM ai_plans WHERE id = $1 AND organizer_id = $2`, [id, organizerId]);
  if (!rows[0]) throw notFound('Plan not found');
  return rows[0];
}

export async function findByEventId(organizerId, eventId) {
  const rows = await query(`SELECT ${COLUMNS} FROM ai_plans WHERE event_id = $1 AND organizer_id = $2 ORDER BY id DESC LIMIT 1`, [eventId, organizerId]);
  return rows[0];
}

/** Save the organizer's edits. A confirmed plan goes back to draft: it has to be confirmed again. */
export async function savePlan(organizerId, id, plan) {
  const current = await find(organizerId, id);
  if (current.status === 'published') throw conflict('This plan has already been published as an event, so it can no longer be edited');
  await query(`UPDATE ai_plans SET plan = $3::jsonb, status = 'draft', confirmed_at = NULL, updated_at = NOW() WHERE id = $1 AND organizer_id = $2`, [id, organizerId, json(plan)]);
  return find(organizerId, id);
}

export async function confirm(organizerId, id) {
  const current = await find(organizerId, id);
  if (current.status === 'published') throw conflict('This plan has already been published');
  await query(`UPDATE ai_plans SET status = 'confirmed', confirmed_at = NOW(), updated_at = NOW() WHERE id = $1 AND organizer_id = $2`, [id, organizerId]);
  return find(organizerId, id);
}

export async function remove(organizerId, id) {
  const current = await find(organizerId, id);
  if (current.status === 'published') throw conflict('A published plan is kept as the record of how the event was planned');
  await query(`DELETE FROM ai_plans WHERE id = $1 AND organizer_id = $2`, [id, organizerId]);
}

/* ------------------------------------------------------------------ publishing */

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Event fields the plan already decides, used to prefill the publish form. */
export function publishDefaults(plan) {
  const first = [...plan.schedule].filter((s) => s.day === 1).sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  const lastDay = Math.max(...plan.schedule.map((s) => s.day));
  const last = [...plan.schedule].filter((s) => s.day === lastDay).sort((a, b) => b.endTime.localeCompare(a.endTime))[0];
  return {
    name: plan.title,
    description: plan.summary,
    type: plan.eventType,
    days: Math.max(plan.structure.days, lastDay),
    startTime: first?.startTime ?? '09:00',
    endTime: last?.endTime ?? '17:00',
    maxParticipants: plan.registration.maxParticipants,
    requiresApproval: plan.registration.requiresApproval,
    deadlineDaysBeforeEvent: plan.registration.deadlineDaysBeforeEvent,
    team: plan.team,
    criteria: plan.judging.criteria.length,
    sessions: plan.schedule.length,
  };
}

/** The fields eventSchema expects, combining the plan's decisions with what the organizer typed in. */
export function eventInputFor(plan, form) {
  const defaults = publishDefaults(plan);
  const days = defaults.days;
  return {
    name: form.name,
    description: form.description,
    type: plan.eventType,
    date: form.date,
    endDate: days > 1 ? addDays(form.date, days - 1) : undefined,
    startTime: form.startTime,
    endTime: form.endTime,
    venue: form.venue,
    maxParticipants: plan.registration.maxParticipants,
    registrationDeadline: form.registrationDeadline,
    organizerName: form.organizerName,
    organizerContact: form.organizerContact,
    requiresApproval: plan.registration.requiresApproval,
    teamEnabled: plan.team.enabled,
    minTeamSize: plan.team.enabled ? plan.team.minSize : 1,
    maxTeamSize: plan.team.enabled ? plan.team.maxSize : 4,
    allowMultipleTeams: plan.team.enabled ? plan.team.allowMultipleTeams : false,
  };
}

/**
 * Turn a confirmed plan into a real event with its schedule and judging criteria.
 * `eventData` has already passed the normal event validation. Nothing is created from a draft.
 */
export async function publish(organizerId, id, eventData) {
  const current = await find(organizerId, id);
  if (current.status === 'published') throw conflict('This plan has already been published');
  if (current.status !== 'confirmed') throw conflict('Confirm the plan before publishing it');

  const event = await events.createEvent(organizerId, eventData);
  try {
    for (const item of current.plan.schedule) {
      await schedule.create(event, {
        title: item.title,
        description: item.description,
        date: addDays(event.date, item.day - 1),
        startTime: item.startTime,
        endTime: item.endTime,
        venue: item.venueHint || event.venue,
        speaker: item.speakerHint,
        sessionType: item.sessionType,
      });
    }
    for (const criterion of current.plan.judging.criteria) {
      await judging.createCriterion(event.id, { name: criterion.name, description: criterion.description, maxScore: criterion.maxScore });
    }
    await query(`UPDATE ai_plans SET status = 'published', event_id = $3, published_at = NOW(), updated_at = NOW() WHERE id = $1 AND organizer_id = $2`, [id, organizerId, event.id]);
  } catch (err) {
    // Do not leave a half-built event behind. Its schedule and criteria are removed with it.
    await query(`DELETE FROM events WHERE id = $1`, [event.id]).catch(() => {});
    throw err;
  }
  return { event: await events.findById(event.id), plan: await find(organizerId, id) };
}

/** Plan plus the things the UI shows next to it. */
export function present(row) {
  return { ...row, warnings: planWarnings(row.plan), publishDefaults: publishDefaults(row.plan) };
}
