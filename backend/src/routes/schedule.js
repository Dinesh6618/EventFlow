import { Router } from 'express';
import * as announcements from '../controllers/announcementController.js';
import * as notificationCtrl from '../controllers/notificationController.js';
import * as scheduleCtrl from '../controllers/scheduleController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { announcementSchema, notificationsQuerySchema, scheduleSchema } from '../validators/scheduleValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);

// Schedule
router.get('/events/:id/schedule', authenticate, scheduleCtrl.list);
router.post('/events/:id/schedule', authenticate, organizerOnly, validate(scheduleSchema), scheduleCtrl.create);
router.patch('/events/:id/schedule/:itemId', authenticate, organizerOnly, validate(scheduleSchema), scheduleCtrl.update);
router.delete('/events/:id/schedule/:itemId', authenticate, organizerOnly, scheduleCtrl.remove);
router.get('/me/schedule/today', authenticate, requireRole(ROLES.PARTICIPANT), scheduleCtrl.myToday);

// Announcements
router.get('/events/:id/announcements', authenticate, announcements.list);
router.post('/events/:id/announcements', authenticate, organizerOnly, validate(announcementSchema), announcements.create);

// Notifications (every role has an inbox)
router.get('/notifications', authenticate, validate(notificationsQuerySchema, 'query'), notificationCtrl.list);
router.post('/notifications/read-all', authenticate, notificationCtrl.markAllRead);
router.post('/notifications/:id/read', authenticate, notificationCtrl.markRead);

export default router;
