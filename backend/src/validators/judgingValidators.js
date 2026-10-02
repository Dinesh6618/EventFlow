import { z } from 'zod';

export const criterionSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(80, 'Name must be at most 80 characters'),
  description: z.string().trim().max(500, 'Description must be at most 500 characters').optional().transform((v) => v ?? ''),
  maxScore: z.coerce
    .number({ invalid_type_error: 'Enter a number' })
    .int('Use a whole number')
    .min(1, 'Must be at least 1')
    .max(1000, 'Must be at most 1000'),
});

export const assignmentsSchema = z.object({
  teamIds: z.array(z.coerce.number().int().positive(), { invalid_type_error: 'teamIds must be a list' }).max(500),
});

export const autoAssignSchema = z.object({
  judgesPerTeam: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Use a whole number').min(1, 'At least 1').max(10, 'At most 10'),
});

export const evaluationSchema = z.object({
  scores: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).default({}),
  comments: z.string().trim().max(3000, 'Comments must be at most 3000 characters').optional().transform((v) => v ?? ''),
});

export const judgingSettingsSchema = z.object({
  leaderboardPublished: z.boolean(),
  shareJudgeComments: z.boolean(),
});
