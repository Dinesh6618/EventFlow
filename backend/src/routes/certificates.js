import { Router } from 'express';
import * as certificateCtrl from '../controllers/certificateController.js';
import * as feedbackCtrl from '../controllers/feedbackController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { feedbackSchema, issueSchema, revokeSchema } from '../validators/certificateValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
const participantOnly = requireRole(ROLES.PARTICIPANT);

// Public: anyone holding a certificate (or its QR code) can check it.
router.get('/verify/:code', rateLimit({ windowMs: 60_000, max: 30 }), certificateCtrl.verify);

router.get('/certificates/mine', authenticate, participantOnly, certificateCtrl.mine);
router.get('/certificates/:code/pdf', authenticate, certificateCtrl.pdf);
router.get('/events/:id/certificates', authenticate, organizerOnly, certificateCtrl.listForEvent);
router.post('/events/:id/certificates', authenticate, organizerOnly, validate(issueSchema), certificateCtrl.issue);
router.post('/events/:id/certificates/:certId/revoke', authenticate, organizerOnly, validate(revokeSchema), certificateCtrl.revoke);

router.get('/events/:id/feedback/mine', authenticate, participantOnly, feedbackCtrl.mine);
router.put('/events/:id/feedback', authenticate, participantOnly, validate(feedbackSchema), feedbackCtrl.save);
router.get('/events/:id/feedback/summary', authenticate, organizerOnly, feedbackCtrl.summary);

export default router;
