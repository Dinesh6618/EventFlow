import { z } from 'zod';
import { EVENT_TYPES } from '../constants.js';
import { localNow } from '../utils/eventStatus.js';

const text = (label, min, max) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`);

const isRealDate = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const time = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a valid time (HH:MM)`);

const CONTACT_RE = /^([^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s\-()]{7,20})$/;

const baseEventSchema = z.object({
  name: text('Event name', 3, 150),
  description: text('Description', 10, 5000),
  type: z.enum(EVENT_TYPES, {
    errorMap: () => ({ message: 'Select a valid event type' }),
  }),
  date: z
    .string({ required_error: 'Date is required', invalid_type_error: 'Date is required' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be a valid date')
    .refine(isRealDate, 'Date must be a valid date'),
  startTime: time('Start time'),
  endTime: time('End time'),
  venue: text('Venue', 2, 200),
  maxParticipants: z.coerce
    .number({ invalid_type_error: 'Maximum participants must be a number' })
    .int('Maximum participants must be a whole number')
    .min(1, 'Maximum participants must be at least 1')
    .max(100000, 'Maximum participants must be at most 100000'),
  registrationDeadline: z
    .string({ required_error: 'Registration deadline is required', invalid_type_error: 'Registration deadline is required' })
    .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Registration deadline must be a valid date and time')
    .refine((v) => isRealDate(v.slice(0, 10)), 'Registration deadline must be a valid date and time'),
  organizerName: text('Organizer name', 2, 100),
  organizerContact: text('Organizer contact', 5, 100).regex(
    CONTACT_RE,
    'Enter a valid email address or phone number',
  ),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;

/** Rules that compare fields. zod skips these when any field is invalid, so run them separately. */
function crossFieldIssues(input) {
  const { date, startTime, endTime, registrationDeadline } = input;
  const now = localNow();
  const issues = [];
  const add = (path, message) => issues.push({ path: [path], message });

  const dateOk = typeof date === 'string' && DATE_RE.test(date) && isRealDate(date);
  const startOk = typeof startTime === 'string' && TIME_RE.test(startTime);
  const endOk = typeof endTime === 'string' && TIME_RE.test(endTime);
  const deadlineOk =
    typeof registrationDeadline === 'string' &&
    DATETIME_RE.test(registrationDeadline) &&
    isRealDate(registrationDeadline.slice(0, 10));

  if (dateOk && date < now.date) add('date', 'Event date cannot be in the past');
  if (startOk && endOk && endTime <= startTime) add('endTime', 'End time must be after the start time');
  if (deadlineOk) {
    if (registrationDeadline < now.dateTime) {
      add('registrationDeadline', 'Registration deadline cannot be in the past');
    } else if (dateOk && startOk && registrationDeadline > `${date}T${startTime}`) {
      add('registrationDeadline', 'Registration deadline must be on or before the event start');
    }
  }
  return issues;
}

/** Same safeParse contract as a zod schema, but reports field and cross-field errors together. */
export const eventSchema = {
  safeParse(input) {
    const result = baseEventSchema.safeParse(input);
    const issues = [...(result.success ? [] : result.error.issues)];
    for (const issue of crossFieldIssues(input)) {
      if (!issues.some((i) => i.path[0] === issue.path[0])) issues.push(issue);
    }
    return issues.length ? { success: false, error: { issues } } : result;
  },
};

export const eventQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  type: z.enum(EVENT_TYPES).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isRealDate)
    .optional(),
});
