import { Router } from 'express';
import aiRoutes from './ai.js';
import analyticsRoutes from './analytics.js';
import attendanceRoutes from './attendance.js';
import certificateRoutes from './certificates.js';
import insightsRoutes from './insights.js';
import judgingRoutes from './judging.js';
import scheduleRoutes from './schedule.js';
import teamRoutes from './teams.js';
import * as admin from '../controllers/adminController.js';
import * as auth from '../controllers/authController.js';
import * as eventCtrl from '../controllers/eventController.js';
import * as organizer from '../controllers/organizerController.js';
import * as registrationCtrl from '../controllers/registrationController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadEventImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, profileSchema, registerSchema } from '../validators/authValidators.js';
import { eventQuerySchema, eventSchema } from '../validators/eventValidators.js';
import { decisionSchema, participantsQuerySchema } from '../validators/registrationValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
const participantOnly = requireRole(ROLES.PARTICIPANT);

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth
router.post('/auth/register', validate(registerSchema), auth.register);
router.post('/auth/login', validate(loginSchema), auth.login);
router.get('/auth/me', authenticate, auth.me);
router.patch('/auth/me', authenticate, validate(profileSchema), auth.updateProfile);

// Events (any signed-in user can browse; only organizers create)
router.get('/events', authenticate, validate(eventQuerySchema, 'query'), eventCtrl.listEvents);
router.get('/events/mine', authenticate, organizerOnly, eventCtrl.listMyEvents);
router.get('/events/:id', authenticate, eventCtrl.getEvent);
router.post('/events', authenticate, organizerOnly, uploadEventImage, validate(eventSchema), eventCtrl.createEvent);

// Registrations
router.post('/events/:id/registrations', authenticate, participantOnly, registrationCtrl.register);
router.get('/registrations/mine', authenticate, participantOnly, registrationCtrl.mine);
router.get('/registrations/:id', authenticate, registrationCtrl.detail);
router.post('/registrations/:id/cancel', authenticate, participantOnly, registrationCtrl.cancel);
router.patch('/registrations/:id/status', authenticate, organizerOnly, validate(decisionSchema), registrationCtrl.decide);

// Organizer
router.get('/organizer/stats', authenticate, organizerOnly, organizer.stats);
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

router.use(attendanceRoutes);
router.use(scheduleRoutes);
router.use(teamRoutes);
router.use(judgingRoutes);
router.use(certificateRoutes);
router.use(analyticsRoutes);
router.use(aiRoutes);
router.use(insightsRoutes);

export default router;
