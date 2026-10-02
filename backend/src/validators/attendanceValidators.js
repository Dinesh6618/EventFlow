import { z } from 'zod';
import { ACTIONS } from '../models/attendanceModel.js';
import { STAFF_ROLES } from '../models/staffModel.js';

const action = z.enum(ACTIONS, { errorMap: () => ({ message: 'Action must be check_in or check_out' }) });

export const scanSchema = z.object({
  code: z.string({ required_error: 'Scan or enter a code' }).trim().min(1, 'Scan or enter a code').max(200),
  action,
  sessionId: z.coerce.number().int().positive().optional(),
});

export const markSchema = z.object({
  registrationId: z.coerce.number().int().positive(),
  action,
});

export const attendanceQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  state: z.enum(['registered', 'checked_in', 'checked_out', 'absent']).optional(),
});

export const staffSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(STAFF_ROLES, { errorMap: () => ({ message: 'Role must be volunteer or judge' }) }),
});
