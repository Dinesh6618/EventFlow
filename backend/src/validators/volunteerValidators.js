import { z } from 'zod';

const short = (label, max) => z.string().trim().max(max, `${label} must be at most ${max} characters`).optional().transform((v) => v ?? '');

// The full application. Everything beyond the message is optional, so older clients keep working.
export const applySchema = z.object({
  message: short('Message', 500),
  phone: short('Phone', 20),
  year: z.coerce.number().int().min(1).max(5).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(15, 'At most 15 skills').optional().transform((v) => v ?? []),
  interests: short('Interests', 300),
  availability: short('Availability', 100),
  experience: short('Previous experience', 1000),
  preferredDepartment: short('Preferred department', 80),
});

export const decideSchema = z.object({
  status: z.enum(['approved', 'declined'], { errorMap: () => ({ message: 'Status must be approved or declined' }) }),
});
