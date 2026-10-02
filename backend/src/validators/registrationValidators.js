import { z } from 'zod';
import { STATUSES } from '../models/registrationModel.js';

const optionalText = (max) => z.string().trim().max(max).optional();

export const participantsQuerySchema = z.object({
  eventId: z.coerce.number().int().positive().optional(),
  q: optionalText(100),
  department: optionalText(100),
  college: optionalText(150),
  status: z.enum(STATUSES).optional(),
  sort: z.enum(['name', 'college', 'department', 'year', 'status', 'attendance', 'team', 'registered']).optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const decisionSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'Status must be approved or rejected' }),
  }),
});
