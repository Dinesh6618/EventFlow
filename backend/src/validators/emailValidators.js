import { z } from 'zod';
import { TEMPLATE_NAMES } from '../services/email/templates.js';

export const emailLogsQuery = z.object({
  status: z.enum(['queued', 'sent', 'failed']).optional(),
  template: z.enum(TEMPLATE_NAMES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
