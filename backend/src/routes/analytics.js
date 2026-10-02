import { Router } from 'express';
import * as analyticsCtrl from '../controllers/analyticsController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);

router.get('/organizer/analytics', authenticate, organizerOnly, validate(analyticsCtrl.analyticsQuerySchema, 'query'), analyticsCtrl.get);
router.get('/organizer/analytics/export', authenticate, organizerOnly, validate(analyticsCtrl.analyticsQuerySchema, 'query'), analyticsCtrl.exportCsv);

export default router;
