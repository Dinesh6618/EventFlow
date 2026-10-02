import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import * as auth from '../controllers/authController.js';
import * as eventCtrl from '../controllers/eventController.js';
import * as organizer from '../controllers/organizerController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadEventImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, profileSchema, registerSchema } from '../validators/authValidators.js';
import { eventQuerySchema, eventSchema } from '../validators/eventValidators.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ status: 'ok' }));

// Auth
router.post('/auth/register', validate(registerSchema), auth.register);
router.post('/auth/login', validate(loginSchema), auth.login);
router.get('/auth/me', authenticate, auth.me);
router.patch('/auth/me', authenticate, validate(profileSchema), auth.updateProfile);

// Events (any signed-in user can browse; only organizers create)
router.get('/events', authenticate, validate(eventQuerySchema, 'query'), eventCtrl.listEvents);
router.get('/events/mine', authenticate, requireRole(ROLES.ORGANIZER), eventCtrl.listMyEvents);
router.get('/events/:id', authenticate, eventCtrl.getEvent);
router.post(
  '/events',
  authenticate,
  requireRole(ROLES.ORGANIZER),
  uploadEventImage,
  validate(eventSchema),
  eventCtrl.createEvent,
);

// Organizer
router.get('/organizer/stats', authenticate, requireRole(ROLES.ORGANIZER), organizer.stats);
router.get('/organizer/participants', authenticate, requireRole(ROLES.ORGANIZER), organizer.participants);

// Admin
router.get('/admin/stats', authenticate, requireRole(ROLES.ADMIN), admin.stats);

export default router;
