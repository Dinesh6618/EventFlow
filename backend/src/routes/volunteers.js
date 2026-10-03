import { Router } from 'express';
import * as volunteerCtrl from '../controllers/volunteerController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { applySchema, decideSchema } from '../validators/volunteerValidators.js';

const router = Router();
const participantOnly = [authenticate, requireRole(ROLES.PARTICIPANT)];
const organizerOnly = [authenticate, requireRole(ROLES.ORGANIZER)];

router.get('/volunteer/opportunities', ...participantOnly, volunteerCtrl.opportunities);
router.post('/events/:id/volunteer-applications', ...participantOnly, validate(applySchema), volunteerCtrl.apply);
router.delete('/events/:id/volunteer-applications/mine', ...participantOnly, volunteerCtrl.withdraw);
router.get('/events/:id/volunteer-applications', ...organizerOnly, volunteerCtrl.listForEvent);
router.patch('/events/:id/volunteer-applications/:appId', ...organizerOnly, validate(decideSchema), volunteerCtrl.decide);

export default router;
