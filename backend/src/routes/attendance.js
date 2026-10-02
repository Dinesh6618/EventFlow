import { Router } from 'express';
import * as attendance from '../controllers/attendanceController.js';
import * as staffCtrl from '../controllers/staffController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { attendanceQuerySchema, markSchema, scanSchema, staffSchema } from '../validators/attendanceValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
// Scanning is open to organizers and to participants who were added as volunteers;
// per-event access is enforced in the controller.
const organizerOrParticipant = requireRole(ROLES.ORGANIZER, ROLES.PARTICIPANT);

router.get('/me/assignments', authenticate, requireRole(ROLES.PARTICIPANT), staffCtrl.myAssignments);

router.get('/events/:id/staff', authenticate, organizerOnly, staffCtrl.list);
router.post('/events/:id/staff', authenticate, organizerOnly, validate(staffSchema), staffCtrl.add);
router.delete('/events/:id/staff/:staffId', authenticate, organizerOnly, staffCtrl.remove);

router.post('/events/:id/attendance/scan', authenticate, organizerOrParticipant, validate(scanSchema), attendance.scan);
router.post('/events/:id/attendance/manual', authenticate, organizerOnly, validate(markSchema), attendance.mark);
router.get(
  '/events/:id/attendance',
  authenticate,
  organizerOrParticipant,
  validate(attendanceQuerySchema, 'query'),
  attendance.dashboard,
);
router.get('/events/:id/attendance/export', authenticate, organizerOnly, attendance.exportCsv);

export default router;
