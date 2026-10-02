import { Router } from 'express';
import * as insights from '../controllers/insightsController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { aiGenerationLimit } from '../middleware/aiLimit.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
// Reporting crowd levels is open to organizers and to the event's volunteers (checked per event).
const organizerOrParticipant = requireRole(ROLES.ORGANIZER, ROLES.PARTICIPANT);

router.get('/events/:id/recommendations', authenticate, organizerOnly, insights.list);
router.post('/events/:id/recommendations/ai', authenticate, organizerOnly, aiGenerationLimit, insights.suggestWithAi);
router.patch('/events/:id/recommendations/:rid', authenticate, organizerOnly, validate(insights.statusSchema), insights.update);

router.get('/events/:id/control-center', authenticate, organizerOnly, insights.getControlCenter);

router.get('/events/:id/zones', authenticate, organizerOrParticipant, insights.listZones);
router.post('/events/:id/zones', authenticate, organizerOnly, validate(insights.zoneCreateSchema), insights.createZone);
router.patch('/events/:id/zones/:zoneId', authenticate, organizerOrParticipant, validate(insights.zoneReportSchema), insights.reportZone);
router.delete('/events/:id/zones/:zoneId', authenticate, organizerOnly, insights.removeZone);

export default router;
