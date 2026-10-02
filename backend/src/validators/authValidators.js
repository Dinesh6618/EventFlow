import { z } from 'zod';
import { ROLES, SELF_REGISTER_ROLES } from '../constants.js';

const name = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

const email = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255);

const password = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

// Optional text that is stored as NULL when blank.
const optionalText = (label, max) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((v) => v || null);

const department = optionalText('Department', 100);

// Year of study: 1-4, or 5 for postgraduate. Blank clears it.
const year = z
  .union([z.literal(''), z.null(), z.coerce.number({ invalid_type_error: 'Choose your year' }).int('Choose your year').min(1, 'Choose your year').max(5, 'Choose your year')])
  .optional()
  .transform((v) => (v === '' || v === null ? null : v));

const phone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^\+?[\d\s\-()]{7,20}$/.test(v), 'Enter a valid phone number')
  .transform((v) => v || null);
const college = optionalText('College', 150);

export const registerSchema = z
  .object({
    name,
    email,
    password,
    role: z.enum(SELF_REGISTER_ROLES, {
      errorMap: () => ({ message: 'Role must be organizer or participant' }),
    }),
    department,
    college,
    year,
    phone,
  })
  .superRefine((data, ctx) => {
    // Organizers filter participants by department/college, so participants must provide them.
    if (data.role !== ROLES.PARTICIPANT) return;
    if (!data.department) ctx.addIssue({ code: 'custom', path: ['department'], message: 'Department is required' });
    if (!data.college) ctx.addIssue({ code: 'custom', path: ['college'], message: 'College is required' });
  });

export const loginSchema = z.object({
  email,
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

const skills = z
  .array(z.string().trim().min(1).max(40, 'Each skill must be at most 40 characters'), { invalid_type_error: 'Skills must be a list' })
  .max(15, 'List at most 15 skills')
  .optional();

export const profileSchema = z.object({ name, department, college, skills, year, phone });
