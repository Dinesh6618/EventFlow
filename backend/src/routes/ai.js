import { Router } from 'express';
import * as ai from '../controllers/aiPlanController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { aiGenerationLimit as generationLimit } from '../middleware/aiLimit.js';
import { validate } from '../middleware/validate.js';

const router = Router();
const organizerOnly = [authenticate, requireRole(ROLES.ORGANIZER)];
router.get('/organizer/ai/status', ...organizerOnly, ai.status);
router.get('/organizer/ai/plans', ...organizerOnly, ai.list);
router.post('/organizer/ai/plans', ...organizerOnly, validate(ai.generateSchema), generationLimit, ai.generate);
router.get('/organizer/ai/plans/:id', ...organizerOnly, ai.get);
router.put('/organizer/ai/plans/:id', ...organizerOnly, validate(ai.editSchema), ai.save);
router.delete('/organizer/ai/plans/:id', ...organizerOnly, ai.remove);
router.post('/organizer/ai/plans/:id/schedule', ...organizerOnly, validate(ai.scheduleHintsSchema), generationLimit, ai.suggestSchedule);
router.post('/organizer/ai/plans/:id/confirm', ...organizerOnly, ai.confirm);
router.post('/organizer/ai/plans/:id/publish', ...organizerOnly, validate(ai.publishSchema), ai.publish);
router.get('/organizer/ai/events/:eventId/plan', ...organizerOnly, ai.forEvent);

export default router;
