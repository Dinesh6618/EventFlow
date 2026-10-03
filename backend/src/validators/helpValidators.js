import { z } from 'zod';
import { CONTACT_PREFERENCES, ITEM_STATUSES, PRIORITIES } from '../models/helpModel.js';

// Multipart forms send booleans as the strings "true" / "false".
const bool = z.preprocess((v) => v === true || v === 'true', z.boolean());
const optionalText = (max, label) =>
  z.string().trim().max(max, `${label} must be at most ${max} characters`).optional().transform((v) => v ?? '');
const id = (label) => z.coerce.number({ invalid_type_error: `Choose ${label}` }).int().min(1, `Choose ${label}`);
const PHONE = /^[+\d][\d\s().-]{4,29}$/;

export const createHelpSchema = z.object({
  categoryId: id('what you need help with'),
  description: optionalText(1000, 'Description'),
  location: z.string({ required_error: 'Choose where you are' }).trim().min(2, 'Choose where you are').max(150, 'Location must be at most 150 characters'),
  contactPreference: z.enum(CONTACT_PREFERENCES, { errorMap: () => ({ message: 'Choose how we should reach you' }) }).default('app'),
  confirmUrgent: bool.default(false),
  // Lost & Found only
  lostFoundKind: z.enum(['lost', 'found'], { errorMap: () => ({ message: 'Choose lost or found' }) }).optional(),
  itemName: optionalText(100, 'Item name'),
  itemWhen: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, 'Enter a valid date and time').optional().or(z.literal('').transform(() => undefined)),
});

export const listHelpQuery = z.object({
  state: z.enum(['open', 'active']).optional(),
  status: z.enum(['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed', 'cancelled']).optional(),
  priority: z.enum(PRIORITIES).optional(),
  category: z.string().trim().max(40).optional(),
  eventId: z.coerce.number().int().min(1).optional(),
});

export const statusSchema = z.object({
  status: z.enum(['acknowledged', 'in_progress', 'resolved', 'closed'], { errorMap: () => ({ message: 'Choose a valid status' }) }),
  message: optionalText(300, 'Message'),
});

export const assignSchema = z.object({ volunteerId: id('a volunteer') });

export const prioritySchema = z.object({
  priority: z.enum(PRIORITIES, { errorMap: () => ({ message: 'Choose low, medium, high or urgent' }) }),
  reason: optionalText(200, 'Reason'),
});

export const escalateSchema = z.object({ reason: optionalText(200, 'Reason') });

export const updateSchema = z.object({
  message: z.string({ required_error: 'Write an update' }).trim().min(1, 'Write an update').max(500, 'Update must be at most 500 characters'),
  internal: bool.default(false),
});

export const itemStatusSchema = z.object({
  itemStatus: z.enum(ITEM_STATUSES, { errorMap: () => ({ message: 'Choose open, found, claimed or returned' }) }),
});

/* ---------------------------------------------------------------- admin */

const name = (label, min = 2, max = 100) => z.string({ required_error: `${label} is required` }).trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`);
const priority = z.enum(PRIORITIES, { errorMap: () => ({ message: 'Choose low, medium, high or urgent' }) });

export const categoryCreateSchema = z.object({
  name: name('Name', 2, 60),
  description: optionalText(200, 'Description'),
  icon: z.string().trim().min(1).max(16).optional().transform((v) => v ?? 'ℹ️'),
  priorityLevel: priority.default('medium'),
  isUrgent: bool.default(false),
});

export const categoryUpdateSchema = z
  .object({
    name: name('Name', 2, 60).optional(),
    description: z.string().trim().max(200).optional(),
    icon: z.string().trim().min(1).max(16).optional(),
    priorityLevel: priority.optional(),
    isUrgent: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

const eventId = z.union([z.coerce.number().int().min(1), z.null()]);

export const contactCreateSchema = z.object({
  name: name('Name'),
  department: optionalText(100, 'Department'),
  phone: z.string({ required_error: 'Phone is required' }).trim().regex(PHONE, 'Enter a valid phone number'),
  availability: optionalText(100, 'Availability'),
  description: optionalText(300, 'Description'),
  eventId: eventId.optional(),
});

export const contactUpdateSchema = z
  .object({
    name: name('Name').optional(),
    department: z.string().trim().max(100).optional(),
    phone: z.string().trim().regex(PHONE, 'Enter a valid phone number').optional(),
    availability: z.string().trim().max(100).optional(),
    description: z.string().trim().max(300).optional(),
    eventId: eventId.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const teamCreateSchema = z.object({ name: name('Name', 2, 60), description: optionalText(200, 'Description') });
export const teamUpdateSchema = z
  .object({ name: name('Name', 2, 60).optional(), description: z.string().trim().max(200).optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export const teamMemberSchema = z.object({ email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address') });

const minutes = (max) => z.coerce.number({ invalid_type_error: 'Enter a number of minutes' }).int('Use whole minutes').min(1, 'At least 1 minute').max(max, `At most ${max} minutes`);
export const escalationSchema = z.object({
  ackMinutes: z.object({ urgent: minutes(1440), high: minutes(1440) }),
  unresolvedMinutes: z.object({ urgent: minutes(10080), high: minutes(10080), medium: minutes(10080), low: minutes(10080) }),
});
