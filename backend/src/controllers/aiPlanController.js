import { z } from 'zod';
import { EVENT_TYPES } from '../constants.js';
import * as plans from '../models/aiPlanModel.js';
import { aiStatus } from '../services/ai/anthropic.js';
import { generatePlan, generateScheduleFor } from '../services/ai/planner.js';
import { validatePlan } from '../services/ai/planSchema.js';
import { eventSchema } from '../validators/eventValidators.js';
import { unprocessable } from '../utils/httpError.js';
import { idParam } from '../utils/params.js';

const optionalInt = (label, min, max) => z.coerce.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`).optional();
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);

const hints = {
  eventType: z.preprocess(blankToUndefined, z.enum(EVENT_TYPES, { errorMap: () => ({ message: 'Choose a valid event type' }) }).optional()),
  expectedParticipants: z.preprocess(blankToUndefined, optionalInt('Expected participants', 1, 100000)),
  durationHours: z.preprocess(blankToUndefined, z.coerce.number({ invalid_type_error: 'Duration must be a number' }).min(0.5, 'At least half an hour').max(720, 'Too long').optional()),
  startTime: z.preprocess(blankToUndefined, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00').optional()),
  sessionCount: z.preprocess(blankToUndefined, optionalInt('Sessions', 1, 60)),
  breakMinutes: z.preprocess(blankToUndefined, optionalInt('Break length', 5, 180)),
  breakEveryHours: z.preprocess(blankToUndefined, optionalInt('Break interval', 1, 12)),
};

export const generateSchema = z.object({
  idea: z.string({ required_error: 'Describe the event you want to run' }).trim().min(10, 'Describe the event in a sentence or two (at least 10 characters)').max(2000, 'Keep the description under 2000 characters'),
  ...hints,
});

export const scheduleHintsSchema = z.object({ ...hints, days: z.preprocess(blankToUndefined, optionalInt('Days', 1, 14)) });

export const editSchema = z.object({ plan: z.unknown() });

export const publishSchema = z.object({
  name: z.string().trim().default(''),
  description: z.string().trim().default(''),
  date: z.string().default(''),
  startTime: z.string().default(''),
  endTime: z.string().default(''),
  venue: z.string().trim().default(''),
  registrationDeadline: z.string().default(''),
  organizerName: z.string().trim().default(''),
  organizerContact: z.string().trim().default(''),
});

const errorsOf = (issues) => Object.fromEntries(issues.map((i) => [i.path.join('.') || '_', i.message]).reverse());
const hintsOf = (body) => Object.fromEntries(Object.entries(body).filter(([k, v]) => k !== 'idea' && v !== undefined));
const respond = (row) => ({ plan: plans.present(row) });

export function status(_req, res) {
  res.json(aiStatus());
}

export async function list(req, res) {
  res.json({ plans: await plans.list(req.user.id) });
}

export async function get(req, res) {
  res.json(respond(await plans.find(req.user.id, idParam(req.params.id, 'Plan'))));
}

/** Step 1, "AI generated": the model drafts a plan. Nothing but the draft is created. */
export async function generate(req, res) {
  const { idea, ...rest } = req.body;
  const hintValues = hintsOf(rest);
  const { plan, model, usage } = await generatePlan({ idea, hints: hintValues });
  const row = await plans.create(req.user.id, { request: { idea, ...hintValues }, plan, model, usage });
  res.status(201).json(respond(row));
}

/** Step 3, "Edit": the organizer's own changes, held to the same checks as the AI's output. */
export async function save(req, res) {
  const id = idParam(req.params.id, 'Plan');
  const checked = validatePlan(req.body.plan);
  if (!checked.ok) throw unprocessable('Please fix the highlighted fields', checked.errors);
  res.json(respond(await plans.savePlan(req.user.id, id, checked.plan)));
}

/** A proposal only: the suggested schedule is returned, not saved. The organizer decides whether to use it. */
export async function suggestSchedule(req, res) {
  const row = await plans.find(req.user.id, idParam(req.params.id, 'Plan'));
  const { schedule, model, usage } = await generateScheduleFor(row.plan, hintsOf(req.body));
  res.json({ schedule, model, usage, note: 'This is a suggestion. Save it into the plan to use it.' });
}

/** Step 4, "Confirm": the organizer signs off on the saved plan. */
export async function confirm(req, res) {
  const row = await plans.find(req.user.id, idParam(req.params.id, 'Plan'));
  const checked = validatePlan(row.plan);
  if (!checked.ok) throw unprocessable('The plan has problems to fix first', checked.errors);
  res.json(respond(await plans.confirm(req.user.id, row.id)));
}

/** Step 5, "Publish": only a confirmed plan becomes an event, and the event details are checked like any other event. */
export async function publish(req, res) {
  const row = await plans.find(req.user.id, idParam(req.params.id, 'Plan'));
  const input = plans.eventInputFor(row.plan, req.body);
  const checked = eventSchema.safeParse(input);
  if (!checked.success) throw unprocessable('Please fix the highlighted fields', errorsOf(checked.error.issues));

  const { event, plan } = await plans.publish(req.user.id, row.id, { ...checked.data, endDate: input.endDate });
  res.status(201).json({ event, ...respond(plan) });
}

export async function remove(req, res) {
  await plans.remove(req.user.id, idParam(req.params.id, 'Plan'));
  res.status(204).end();
}

/** The plan an event was published from, for the event's "AI plan" tab. */
export async function forEvent(req, res) {
  const row = await plans.findByEventId(req.user.id, idParam(req.params.eventId, 'Event'));
  res.json({ plan: row ? plans.present(row) : null });
}
