import { z } from 'zod';
import { withCrossFieldChecks } from './crossField.js';

const optionalText = (label, max) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((v) => v ?? '');

const skills = z
  .array(z.string().trim().min(1).max(40, 'Each skill must be at most 40 characters'), {
    invalid_type_error: 'Skills must be a list',
  })
  .max(15, 'List at most 15 skills')
  .optional()
  .transform((v) => v ?? []);

const url = (label) =>
  z
    .string()
    .trim()
    .max(300, `${label} must be at most 300 characters`)
    .optional()
    .transform((v) => v ?? '')
    .refine((v) => v === '' || /^https?:\/\/[^\s]+$/i.test(v), `${label} must start with http:// or https://`);

export const teamSchema = z.object({
  name: z.string({ required_error: 'Team name is required' }).trim().min(2, 'Team name must be at least 2 characters').max(80, 'Team name must be at most 80 characters'),
  projectTitle: optionalText('Project title', 150),
  projectDescription: optionalText('Project description', 2000),
  repositoryUrl: url('Repository link'),
  demoUrl: url('Demo link'),
  skills,
});

export const inviteSchema = z.object({ userId: z.coerce.number().int().positive('Choose a participant') });

export const respondSchema = z.object({ accept: z.boolean({ required_error: 'accept is required', invalid_type_error: 'accept must be true or false' }) });

export const suggestionsQuerySchema = z.object({ skill: z.string().trim().min(1).max(40).optional() });

const baseSettings = z.object({
  teamEnabled: z.boolean(),
  minTeamSize: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole number').min(1, 'At least 1').max(50),
  maxTeamSize: z.coerce.number({ invalid_type_error: 'Enter a number' }).int('Whole number').min(1, 'At least 1').max(50, 'At most 50'),
  allowMultipleTeams: z.boolean(),
});

export const teamSettingsSchema = withCrossFieldChecks(baseSettings, ({ minTeamSize, maxTeamSize }) =>
  Number(maxTeamSize) < Number(minTeamSize)
    ? [{ path: ['maxTeamSize'], message: 'Maximum team size cannot be smaller than the minimum' }]
    : [],
);
