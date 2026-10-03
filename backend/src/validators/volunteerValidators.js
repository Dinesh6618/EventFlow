import { z } from 'zod';

export const applySchema = z.object({
  message: z.string().trim().max(500, 'Message must be at most 500 characters').optional().transform((v) => v ?? ''),
});

export const decideSchema = z.object({
  status: z.enum(['approved', 'declined'], { errorMap: () => ({ message: 'Status must be approved or declined' }) }),
});
