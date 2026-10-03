import { z } from 'zod';
import { PRIORITIES } from '../models/volunteerOpsModel.js';

const bool = z.preprocess((v) => v === true || v === 'true', z.boolean());
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const date = (label = 'Date') => z.string({ required_error: `${label} is required` }).trim().regex(DATE, `${label} must be a valid date`);
const time = (label) => z.string({ required_error: `${label} is required` }).trim().regex(TIME, `${label} must be a time like 09:30`);
const optionalTime = (label) => z.string().trim().regex(TIME, `${label} must be a time like 09:30`).optional().or(z.literal('').transform(() => undefined)).or(z.null().transform(() => undefined));
const id = (label) => z.coerce.number({ invalid_type_error: `Choose ${label}` }).int().min(1, `Choose ${label}`);
const text = (label, max, min = 0) => z.string().trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`);
const optional = (label, max) => text(label, max).optional().transform((v) => v ?? '');
const priority = z.enum(PRIORITIES, { errorMap: () => ({ message: 'Choose low, medium, high or urgent' }) });
const count = z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Use a whole number').min(0, 'Cannot be negative').max(500, 'At most 500');
const patch = (schema) => schema.refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/* ------------------------------------------------------------ departments */

export const departmentCreateSchema = z
  .object({
    name: text('Name', 80, 2),
    description: optional('Description', 500),
    requiredCount: count.default(1),
    location: optional('Location', 150),
    shiftStart: optionalTime('Shift start'),
    shiftEnd: optionalTime('Shift end'),
    instructions: optional('Instructions', 3000),
    priority: priority.default('medium'),
  })
  .refine((v) => !v.shiftStart || !v.shiftEnd || v.shiftEnd > v.shiftStart, { message: 'Shift end must be after the start', path: ['shiftEnd'] });

export const departmentUpdateSchema = patch(
  z.object({
    name: text('Name', 80, 2).optional(),
    description: text('Description', 500).optional(),
    requiredCount: count.optional(),
    location: text('Location', 150).optional(),
    shiftStart: optionalTime('Shift start'),
    shiftEnd: optionalTime('Shift end'),
    instructions: text('Instructions', 3000).optional(),
    priority: priority.optional(),
  }),
);

/* ----------------------------------------------------------------- shifts */

export const shiftCreateSchema = z
  .object({
    departmentIds: z.array(id('a department')).min(1, 'Choose at least one department').max(30).optional(),
    departmentId: id('a department').optional(),
    name: text('Name', 60, 2),
    date: date(),
    startTime: time('Start time'),
    endTime: time('End time'),
    requiredCount: count.default(1),
  })
  .refine((v) => v.departmentIds || v.departmentId, { message: 'Choose a department', path: ['departmentId'] })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] });

export const shiftUpdateSchema = patch(
  z.object({ name: text('Name', 60, 2).optional(), date: date().optional(), startTime: time('Start time').optional(), endTime: time('End time').optional(), requiredCount: count.optional() }),
);

/* ------------------------------------------------------------ assignments */

export const assignmentCreateSchema = z.object({
  userId: id('a volunteer'),
  departmentId: id('a department'),
  shiftId: id('a shift').nullable().optional(),
  date: date().optional(),
  startTime: time('Start time').optional(),
  endTime: time('End time').optional(),
  location: optional('Location', 150),
  task: optional('Task', 300),
  allowOverflow: bool.default(false),
});

export const assignmentUpdateSchema = patch(
  z.object({
    userId: id('a volunteer').optional(),
    departmentId: id('a department').optional(),
    shiftId: id('a shift').nullable().optional(),
    date: date().optional(),
    startTime: time('Start time').optional(),
    endTime: time('End time').optional(),
    location: text('Location', 150).optional(),
    task: text('Task', 300).optional(),
    allowOverflow: bool.optional(),
  }),
);

export const assignmentListQuery = z.object({ date: date().optional(), userId: z.coerce.number().int().min(1).optional(), includeRemoved: bool.optional() });
export const breakSchema = z.object({ onBreak: bool });
export const removeSchema = z.object({ reason: optional('Reason', 200) });

/* ------------------------------------------------------------------ tasks */

export const taskCreateSchema = z
  .object({
    userId: id('a volunteer'),
    departmentId: id('a department'),
    title: text('Task name', 150, 2),
    description: optional('Description', 2000),
    location: optional('Location', 150),
    date: date(),
    startTime: time('Start time'),
    endTime: time('End time'),
    priority: priority.default('medium'),
    instructions: optional('Instructions', 3000),
  })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after the start time', path: ['endTime'] });

export const taskUpdateSchema = patch(
  z.object({
    userId: id('a volunteer').optional(),
    departmentId: id('a department').optional(),
    title: text('Task name', 150, 2).optional(),
    description: text('Description', 2000).optional(),
    location: text('Location', 150).optional(),
    date: date().optional(),
    startTime: time('Start time').optional(),
    endTime: time('End time').optional(),
    priority: priority.optional(),
    instructions: text('Instructions', 3000).optional(),
    status: z.enum(['cancelled', 'assigned']).optional(),
    allowCompleted: bool.optional(),
  }),
);

export const taskListQuery = z.object({
  status: z.enum(['assigned', 'accepted', 'in_progress', 'completed', 'cancelled']).optional(),
  departmentId: z.coerce.number().int().min(1).optional(),
  userId: z.coerce.number().int().min(1).optional(),
  priority: priority.optional(),
  date: date().optional(),
});

/* ------------------------------------------------- announcements, requests */

export const announcementCreateSchema = z
  .object({
    title: text('Title', 120, 2),
    message: text('Message', 2000, 1),
    scope: z.enum(['all', 'department', 'shift', 'volunteer'], { errorMap: () => ({ message: 'Choose who should receive it' }) }),
    departmentId: id('a department').optional(),
    shiftId: id('a shift').optional(),
    userId: id('a volunteer').optional(),
  })
  .superRefine((v, ctx) => {
    if (v.scope === 'department' && !v.departmentId) ctx.addIssue({ code: 'custom', path: ['departmentId'], message: 'Choose a department' });
    if (v.scope === 'shift' && !v.shiftId) ctx.addIssue({ code: 'custom', path: ['shiftId'], message: 'Choose a shift' });
    if (v.scope === 'volunteer' && !v.userId) ctx.addIssue({ code: 'custom', path: ['userId'], message: 'Choose a volunteer' });
  });

export const reassignmentSchema = z.object({ reason: text('Reason', 500, 3) });
export const reassignmentDecisionSchema = z.object({
  status: z.enum(['approved', 'rejected'], { errorMap: () => ({ message: 'Choose approved or rejected' }) }),
  note: optional('Note', 300),
});

/* -------------------------------------------------------------- volunteers */

export const volunteerListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  departmentId: z.coerce.number().int().min(1).optional(),
  status: z.enum(['available', 'assigned', 'checked_in', 'active', 'on_break', 'completed', 'absent', 'inactive']).optional(),
  attendance: z.enum(['not_checked_in', 'checked_in', 'checked_out', 'absent', 'late']).optional(),
  shiftId: z.coerce.number().int().min(1).optional(),
  date: date().optional(),
});

export const volunteerUpdateSchema = patch(z.object({ isActive: bool.optional(), notes: text('Notes', 500).optional() }));
export const attendanceQuery = z.object({ date: date().optional() });

export const profileUpdateSchema = patch(
  z.object({
    interests: text('Interests', 300).optional(),
    experience: text('Experience', 1000).optional(),
    availability: text('Availability', 100).optional(),
    skills: z.array(text('Skill', 40, 1)).max(15, 'At most 15 skills').optional(),
    phone: z.string().trim().max(20).optional(),
    year: z.coerce.number().int().min(1).max(5).optional(),
  }),
);

/* ------------------------------------------------------------------ admin */

export const categoryCreateSchema = z.object({ name: text('Name', 80, 2), description: optional('Description', 500), instructions: optional('Instructions', 3000) });
export const categoryUpdateSchema = patch(
  z.object({ name: text('Name', 80, 2).optional(), description: text('Description', 500).optional(), instructions: text('Instructions', 3000).optional(), isActive: z.boolean().optional() }),
);
const mins = z.coerce.number({ invalid_type_error: 'Enter a number of minutes' }).int('Use whole minutes').min(0, 'Cannot be negative').max(240, 'At most 240 minutes');
export const settingsSchema = z.object({ earlyCheckInMinutes: mins, lateGraceMinutes: mins, shiftReminderMinutes: mins });
export const suspendSchema = z.object({ status: z.enum(['active', 'suspended'], { errorMap: () => ({ message: 'Choose active or suspended' }) }) });
export const adminListQuery = z.object({ eventId: z.coerce.number().int().min(1).optional(), search: z.string().trim().max(100).optional() });
