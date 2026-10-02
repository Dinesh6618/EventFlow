import { z } from 'zod';
import { SESSION_TYPES } from '../models/scheduleModel.js';
import { withCrossFieldChecks } from './crossField.js';

const optionalText = (label, max) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((v) => v ?? '');

const isRealDate = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const time = (label) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} is required` })
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, `${label} must be a valid time (HH:MM)`);

const baseScheduleSchema = z.object({
    title: z
      .string({ required_error: 'Title is required' })
      .trim()
      .min(1, 'Title is required')
      .max(150, 'Title must be at most 150 characters'),
    description: optionalText('Description', 2000),
    date: z
      .string({ required_error: 'Date is required' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be a valid date')
      .refine(isRealDate, 'Date must be a valid date'),
    startTime: time('Start time'),
    endTime: time('End time'),
    venue: optionalText('Venue', 200),
    speaker: optionalText('Speaker', 150),
    sessionType: z.enum(SESSION_TYPES, { errorMap: () => ({ message: 'Choose a session type' }) }),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const scheduleSchema = withCrossFieldChecks(baseScheduleSchema, ({ startTime, endTime }) =>
  TIME.test(startTime ?? '') && TIME.test(endTime ?? '') && endTime <= startTime
    ? [{ path: ['endTime'], message: 'End time must be after the start time' }]
    : [],
);

export const announcementSchema = z.object({
  title: z.string({ required_error: 'Title is required' }).trim().min(1, 'Title is required').max(150),
  message: z.string({ required_error: 'Message is required' }).trim().min(1, 'Message is required').max(2000),
});

export const notificationsQuerySchema = z.object({
  unread: z
    .enum(['1', 'true', '0', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.coerce.number().int().positive().optional(),
});
