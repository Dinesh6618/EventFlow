import { z } from 'zod';
import { TYPES } from '../models/certificateModel.js';

const type = z.enum(TYPES, { errorMap: () => ({ message: 'Choose a certificate type' }) });

const recipient = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email address'),
});

export const issueSchema = z.object({
  type,
  scope: z.enum(['attended', 'registered']).optional(),
  finalistUpToRank: z.coerce.number().int().min(3).max(50).optional(),
  recipients: z.array(recipient).min(1, 'Add at least one recipient').max(100).optional(),
});

export const revokeSchema = z.object({
  reason: z.string().trim().max(300).optional().transform((v) => v ?? ''),
});

const rating = (label) =>
  z.coerce.number({ invalid_type_error: `${label} must be a number from 1 to 5` }).int(`${label} must be a whole number`).min(1, `${label} must be from 1 to 5`).max(5, `${label} must be from 1 to 5`);

export const feedbackSchema = z.object({
  sessionId: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  overall: rating('Overall rating'),
  organization: rating('Organization rating').nullish().transform((v) => v ?? null),
  speaker: rating('Speaker rating').nullish().transform((v) => v ?? null),
  venue: rating('Venue rating').nullish().transform((v) => v ?? null),
  comments: z.string().trim().max(2000, 'Comments must be at most 2000 characters').optional().transform((v) => v ?? ''),
  suggestions: z.string().trim().max(2000, 'Suggestions must be at most 2000 characters').optional().transform((v) => v ?? ''),
});
