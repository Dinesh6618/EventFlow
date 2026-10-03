import { config } from '../config.js';
import { Router } from 'express';
import analyticsRoutes from './analytics.js';
import attendanceRoutes from './attendance.js';
import certificateRoutes from './certificates.js';
import insightsRoutes from './insights.js';
import judgingRoutes from './judging.js';
import scheduleRoutes from './schedule.js';
import teamRoutes from './teams.js';
import helpRoutes from './help.js';
import volunteerOpsRoutes from './volunteerOps.js';
import volunteerRoutes from './volunteers.js';
import * as admin from '../controllers/adminController.js';
import * as emailAdmin from '../controllers/emailAdminController.js';
import * as auth from '../controllers/authController.js';
import * as eventCtrl from '../controllers/eventController.js';
import * as organizer from '../controllers/organizerController.js';
import * as studentCtrl from '../controllers/studentController.js';
import * as registrationCtrl from '../controllers/registrationController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { clientKey, emailOf, fingerprint, rateLimit, userIdOf } from '../middleware/rateLimit.js';
import { uploadEventImage } from '../middleware/upload.js';
import { emailConfigured } from '../services/email/index.js';
import { validate } from '../middleware/validate.js';
import { emailLogsQuery } from '../validators/emailValidators.js';
import { changeEmailSchema, emailPreferencesSchema, loginSchema, profileSchema, registerSchema, resendVerificationSchema, verifyEmailSchema } from '../validators/authValidators.js';
import { eventQuerySchema, eventSchema } from '../validators/eventValidators.js';
import { decisionSchema, participantsQuerySchema } from '../validators/registrationValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
const participantOnly = requireRole(ROLES.PARTICIPANT);

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------- rate limits
// Every number comes from config.rateLimit (environment variables, see .env.example).
const rl = config.rateLimit;

// General traffic. Signed-in people are counted per account, so one busy student cannot use up a whole
// campus network's allowance; visitors who are not signed in are counted per IP address. The public auth
// endpoints and /health have their own limits below.
router.use(
  rateLimit({
    name: 'general',
    windowMs: () => rl.windowMs,
    max: (req) => (userIdOf(req) ? rl.userMax : rl.max),
    key: clientKey,
    skip: (req) => req.path === '/health' || (!userIdOf(req) && req.path.startsWith('/auth/')),
  }),
);

// Login and anything else that checks a password. Only FAILED attempts count, so a correct login is
// never blocked, and the limit is per IP address and email together (plus a looser one per IP address
// for someone trying many emails). A correct password on an unverified account is not a failure either.
const passwordGuard = [
  rateLimit({
    name: 'login-ip',
    windowMs: () => rl.auth.windowMs,
    max: () => rl.auth.ipMax,
    key: (req) => req.ip,
    refund: (_req, res) => res.statusCode < 400 || res.locals.passwordWasRight === true,
    message: 'Too many failed attempts. Please try again later.',
  }),
  rateLimit({
    name: 'login',
    windowMs: () => rl.auth.windowMs,
    max: () => rl.auth.max,
    key: (req) => `${req.ip}|${emailOf(req)}`,
    refund: (_req, res) => res.statusCode < 400 || res.locals.passwordWasRight === true,
    message: 'Too many failed attempts. Please try again later.',
  }),
];

// Sign-up. Attempts that only failed validation (a weak password, a typo) are not held against anyone.
const signupLimit = rateLimit({
  name: 'signup',
  windowMs: () => rl.signup.windowMs,
  max: () => rl.signup.max,
  key: (req) => req.ip,
  refund: (_req, res) => res.statusCode === 422,
});

/**
 * Limits for the emails people can ask for (verification again, or after a change of address), so nobody
 * can use EventFlow to flood an inbox: a cooldown between two emails to the same address, a few per hour
 * per address, and a roomier cap per IP address. They apply the same to addresses that have no account,
 * so they reveal nothing. Nothing is counted while email is not set up, and a send that failed on our
 * side is given back.
 */
function emailSendLimits(name, keyOf) {
  const common = { skip: () => !emailConfigured(), refund: (_req, res) => res.statusCode >= 500 };
  return [
    rateLimit({ ...common, name: `${name}-cooldown`, windowMs: () => rl.email.cooldownSeconds * 1000, max: 1, key: keyOf, skip: () => !emailConfigured() || !(rl.email.cooldownSeconds > 0) }),
    rateLimit({ ...common, name: `${name}-email`, windowMs: () => rl.email.windowMs, max: () => rl.email.max, key: keyOf }),
    rateLimit({ ...common, name: `${name}-ip`, windowMs: () => rl.email.windowMs, max: () => rl.email.ipMax, key: (req) => req.ip }),
  ];
}
// The resend page may hold only the emailed token (an expired link), so that is the key when there is no address.
const addressKey = (req) => emailOf(req) || `ip:${req.ip}`;
const resendKey = (req) => emailOf(req) || (req.body?.token ? `t:${fingerprint(req.body.token)}` : `ip:${req.ip}`);
const resendLimits = emailSendLimits('resend', resendKey);
const changeEmailLimits = emailSendLimits('change-email', addressKey);

// Opening the emailed verification link. The tokens cannot be guessed, so this only stops floods.
const linkLimit = rateLimit({ name: 'email-link', windowMs: () => rl.link.windowMs, max: () => rl.link.max, key: (req) => req.ip });

// Auth
router.post('/auth/register', signupLimit, validate(registerSchema), auth.register);
router.post('/auth/login', ...passwordGuard, validate(loginSchema), auth.login);
router.post('/auth/verify-email', linkLimit, validate(verifyEmailSchema), auth.verifyEmail);
router.post('/auth/resend-verification', ...resendLimits, validate(resendVerificationSchema), auth.resendVerification);
router.post('/auth/change-email', ...passwordGuard, ...changeEmailLimits, validate(changeEmailSchema), auth.changeEmail);
router.get('/auth/me', authenticate, auth.me);
router.get('/auth/email-preferences', authenticate, auth.getEmailPreferences);
router.put('/auth/email-preferences', authenticate, validate(emailPreferencesSchema), auth.saveEmailPreferences);
router.patch('/auth/me', authenticate, validate(profileSchema), auth.updateProfile);

// Events (any signed-in user can browse; only organizers create)
router.get('/events', authenticate, validate(eventQuerySchema, 'query'), eventCtrl.listEvents);
router.get('/events/mine', authenticate, organizerOnly, eventCtrl.listMyEvents);
router.get('/events/:id', authenticate, eventCtrl.getEvent);
router.post('/events', authenticate, organizerOnly, uploadEventImage, validate(eventSchema), eventCtrl.createEvent);

// Saved events, the student home screen and public numbers for the landing page
router.post('/events/:id/favorite', authenticate, participantOnly, eventCtrl.favorite);
router.delete('/events/:id/favorite', authenticate, participantOnly, eventCtrl.favorite);
router.get('/me/dashboard', authenticate, participantOnly, studentCtrl.dashboard);
router.get('/public/stats', studentCtrl.publicStats);

// Registrations
router.post('/events/:id/registrations', authenticate, participantOnly, registrationCtrl.register);
router.get('/registrations/mine', authenticate, participantOnly, registrationCtrl.mine);
router.get('/registrations/:id', authenticate, registrationCtrl.detail);
router.post('/registrations/:id/cancel', authenticate, participantOnly, registrationCtrl.cancel);
router.patch('/registrations/:id/status', authenticate, organizerOnly, validate(decisionSchema), registrationCtrl.decide);

// Organizer
router.get('/organizer/stats', authenticate, organizerOnly, organizer.stats);
router.get('/organizer/activity', authenticate, organizerOnly, organizer.activity);
router.get(
  '/organizer/participants',
  authenticate,
  organizerOnly,
  validate(participantsQuerySchema, 'query'),
  registrationCtrl.listParticipants,
);
router.get(
  '/organizer/participants/export',
  authenticate,
  organizerOnly,
  validate(participantsQuerySchema, 'query'),
  registrationCtrl.exportParticipants,
);

// Admin
router.get('/admin/stats', authenticate, requireRole(ROLES.ADMIN), admin.stats);
router.get('/admin/email-status', authenticate, requireRole(ROLES.ADMIN), emailAdmin.status);
router.get('/admin/email-logs', authenticate, requireRole(ROLES.ADMIN), validate(emailLogsQuery, 'query'), emailAdmin.list);
router.post('/admin/email-test', authenticate, requireRole(ROLES.ADMIN), rateLimit({ name: 'email-test', windowMs: 60_000, max: 5, key: (req) => `emailtest:${req.user.id}` }), emailAdmin.test);

router.use(attendanceRoutes);
router.use(scheduleRoutes);
router.use(teamRoutes);
router.use(volunteerRoutes);
router.use(helpRoutes);
router.use(volunteerOpsRoutes);
router.use(judgingRoutes);
router.use(certificateRoutes);
router.use(analyticsRoutes);
router.use(insightsRoutes);

export default router;
