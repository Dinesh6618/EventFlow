import { z } from 'zod';
import { EVENT_TYPES } from '../../constants.js';
import { SESSION_TYPES } from '../../models/scheduleModel.js';

/* ------------------------------------------------------------------------------------------
 * 1. JSON Schema handed to Claude (structured outputs). Structured outputs do not support numeric
 *    ranges, so ranges and cross-field rules live in the zod validation below instead.
 * ---------------------------------------------------------------------------------------- */

const str = { type: 'string' };
const int = { type: 'integer' };
const bool = { type: 'boolean' };
const strings = { type: 'array', items: str };
const object = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const list = (properties) => ({ type: 'array', items: object(properties) });

const scheduleItem = {
  day: int,
  startTime: str,
  endTime: str,
  title: str,
  description: str,
  sessionType: { type: 'string', enum: SESSION_TYPES },
  venueHint: str,
  speakerHint: str,
};

export const scheduleJsonSchema = object({ schedule: list(scheduleItem) });

export const planJsonSchema = object({
  title: str,
  summary: str,
  eventType: { type: 'string', enum: EVENT_TYPES },
  structure: object({
    durationHours: { type: 'number' },
    days: int,
    expectedParticipants: int,
    format: str,
    phases: list({ name: str, description: str }),
  }),
  schedule: list(scheduleItem),
  registration: object({
    requiresApproval: bool,
    maxParticipants: int,
    requirements: strings,
    deadlineDaysBeforeEvent: int,
  }),
  team: object({ enabled: bool, minSize: int, maxSize: int, allowMultipleTeams: bool }),
  volunteers: object({ total: int, roles: list({ role: str, count: int, responsibilities: str }) }),
  judging: object({ criteria: list({ name: str, maxScore: int, description: str }), judgesNeeded: int }),
  resources: list({ category: str, items: strings }),
  communicationPlan: list({ when: str, channel: str, message: str }),
  riskChecklist: list({ risk: str, likelihood: { type: 'string', enum: ['low', 'medium', 'high'] }, mitigation: str }),
});

/* ------------------------------------------------------------------------------------------
 * 2. Validation: applied to what Claude returns AND to every edit the organizer makes.
 * ---------------------------------------------------------------------------------------- */

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (label, max) => z.string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` }).trim().max(max, `${label} must be at most ${max} characters`);
const required = (label, max) => text(label, max).min(1, `${label} is required`);
const whole = (label, min, max) => z.number({ invalid_type_error: `${label} must be a number`, required_error: `${label} is required` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`);
const time = (label) => z.string({ required_error: `${label} is required` }).regex(TIME, `${label} must be a valid time (HH:MM)`);

const scheduleItemSchema = z.object({
  day: whole('Day', 1, 14),
  startTime: time('Start time'),
  endTime: time('End time'),
  title: required('Title', 150),
  description: text('Description', 500).default(''),
  sessionType: z.enum(SESSION_TYPES, { errorMap: () => ({ message: 'Choose a session type' }) }),
  venueHint: text('Venue', 100).default(''),
  speakerHint: text('Speaker', 100).default(''),
});

export const scheduleSchema = z.array(scheduleItemSchema).min(1, 'The schedule needs at least one session').max(60, 'At most 60 sessions');

const planSchema = z.object({
  title: required('Title', 150).min(3, 'Title must be at least 3 characters'),
  summary: text('Summary', 1500).default(''),
  eventType: z.enum(EVENT_TYPES, { errorMap: () => ({ message: 'Choose an event type' }) }),
  structure: z.object({
    durationHours: z.number({ invalid_type_error: 'Duration must be a number' }).min(0.5, 'Duration must be at least half an hour').max(720, 'Duration is too long'),
    days: whole('Days', 1, 14),
    expectedParticipants: whole('Expected participants', 1, 100000),
    format: text('Format', 300).default(''),
    phases: z.array(z.object({ name: required('Phase name', 100), description: text('Description', 500).default('') })).max(12, 'At most 12 phases'),
  }),
  schedule: scheduleSchema,
  registration: z.object({
    requiresApproval: z.boolean(),
    maxParticipants: whole('Maximum participants', 1, 100000),
    requirements: z.array(required('Requirement', 200)).max(15, 'At most 15 requirements'),
    deadlineDaysBeforeEvent: whole('Deadline (days before)', 0, 90),
  }),
  team: z.object({
    enabled: z.boolean(),
    minSize: whole('Minimum team size', 1, 50),
    maxSize: whole('Maximum team size', 1, 50),
    allowMultipleTeams: z.boolean(),
  }),
  volunteers: z.object({
    total: whole('Volunteers', 0, 1000),
    roles: z.array(z.object({ role: required('Role', 100), count: whole('Count', 0, 1000), responsibilities: text('Responsibilities', 300).default('') })).max(15, 'At most 15 roles'),
  }),
  judging: z.object({
    criteria: z.array(z.object({ name: required('Criterion', 80).min(2, 'Name must be at least 2 characters'), maxScore: whole('Maximum score', 1, 1000), description: text('Description', 500).default('') })).max(10, 'At most 10 criteria'),
    judgesNeeded: whole('Judges needed', 0, 50),
  }),
  resources: z.array(z.object({ category: required('Category', 100), items: z.array(required('Item', 200)).max(20, 'At most 20 items') })).max(15, 'At most 15 resource groups'),
  communicationPlan: z.array(z.object({ when: required('When', 100), channel: required('Channel', 100), message: required('Message', 400) })).max(15, 'At most 15 steps'),
  riskChecklist: z.array(z.object({ risk: required('Risk', 200), likelihood: z.enum(['low', 'medium', 'high'], { errorMap: () => ({ message: 'Choose low, medium or high' }) }), mitigation: required('Mitigation', 400) })).max(15, 'At most 15 risks'),
});

const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/**
 * Rules that compare fields, returned as { 'path.to.field': message }. They are written to cope with
 * half-valid input so that one bad field never hides the others from the person fixing the plan.
 */
function crossChecks(plan) {
  const errors = {};
  const schedule = Array.isArray(plan?.schedule) ? plan.schedule : [];
  const days = plan?.structure?.days;

  schedule.forEach((item, i) => {
    if (typeof item?.startTime === 'string' && typeof item?.endTime === 'string' && TIME.test(item.startTime) && TIME.test(item.endTime) && item.endTime <= item.startTime) {
      errors[`schedule.${i}.endTime`] = 'End time must be after the start time (split overnight sessions across days)';
    }
    if (Number.isInteger(item?.day) && Number.isInteger(days) && item.day > days) {
      errors[`schedule.${i}.day`] = `The plan only runs for ${days} day${days === 1 ? '' : 's'}`;
    }
  });

  const { minSize, maxSize } = plan?.team ?? {};
  if (Number.isInteger(minSize) && Number.isInteger(maxSize) && maxSize < minSize) errors['team.maxSize'] = 'Maximum team size cannot be smaller than the minimum';

  const names = new Set();
  (Array.isArray(plan?.judging?.criteria) ? plan.judging.criteria : []).forEach((c, i) => {
    if (typeof c?.name !== 'string') return;
    const key = c.name.trim().toLowerCase();
    if (names.has(key)) errors[`judging.criteria.${i}.name`] = 'Criterion names must be different';
    names.add(key);
  });
  return errors;
}

/** Things worth a second look that do not make the plan invalid. */
export function planWarnings(plan) {
  const warnings = [];
  const byDay = new Map();
  plan.schedule.forEach((item, i) => byDay.set(item.day, [...(byDay.get(item.day) ?? []), { ...item, i }]));
  for (const items of byDay.values()) {
    const sorted = [...items].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
    for (let k = 1; k < sorted.length; k += 1) {
      if (toMinutes(sorted[k].startTime) < toMinutes(sorted[k - 1].endTime)) {
        warnings.push({ path: `schedule.${sorted[k].i}`, message: `"${sorted[k].title}" overlaps "${sorted[k - 1].title}" on day ${sorted[k].day}` });
      }
    }
  }
  const total = plan.judging.criteria.reduce((sum, c) => sum + c.maxScore, 0);
  if (plan.judging.criteria.length && total !== 100) warnings.push({ path: 'judging.criteria', message: `Judging criteria add up to ${total}, not 100` });
  if (plan.registration.maxParticipants < plan.structure.expectedParticipants) warnings.push({ path: 'registration.maxParticipants', message: 'Registration capacity is below the expected number of participants' });
  if (plan.team.enabled && plan.judging.criteria.length === 0) warnings.push({ path: 'judging.criteria', message: 'Teams are on but there are no judging criteria' });
  return warnings;
}

const errorMap = (issues) => {
  const errors = {};
  for (const issue of issues) {
    const key = issue.path.join('.') || '_';
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
};

/** Validate a whole plan. Returns { ok, plan } or { ok: false, errors: { path: message } }. */
export function validatePlan(input) {
  const parsed = planSchema.safeParse(input);
  const errors = { ...crossChecks(input), ...(parsed.success ? {} : errorMap(parsed.error.issues)) };
  return Object.keys(errors).length || !parsed.success ? { ok: false, errors } : { ok: true, plan: parsed.data };
}

/** Validate just a schedule (used when only the schedule is regenerated). */
export function validateSchedule(input, days) {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: errorMap(parsed.error.issues) };
  const errors = {};
  parsed.data.forEach((item, i) => {
    if (item.endTime <= item.startTime) errors[`schedule.${i}.endTime`] = 'End time must be after the start time';
    if (item.day > days) errors[`schedule.${i}.day`] = `The plan only runs for ${days} day${days === 1 ? '' : 's'}`;
  });
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, schedule: parsed.data };
}
