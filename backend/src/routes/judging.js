import { Router } from 'express';
import * as judgingCtrl from '../controllers/judgingController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assignmentsSchema, autoAssignSchema, criterionSchema, evaluationSchema, judgingSettingsSchema } from '../validators/judgingValidators.js';

const router = Router();
const organizerOnly = requireRole(ROLES.ORGANIZER);
const participantOnly = requireRole(ROLES.PARTICIPANT);

// Criteria: the organizer edits; organizer, judges, volunteers and registered participants can read
router.get('/events/:id/criteria', authenticate, judgingCtrl.listCriteria);
router.post('/events/:id/criteria', authenticate, organizerOnly, validate(criterionSchema), judgingCtrl.createCriterion);
router.patch('/events/:id/criteria/:criterionId', authenticate, organizerOnly, validate(criterionSchema), judgingCtrl.updateCriterion);
router.delete('/events/:id/criteria/:criterionId', authenticate, organizerOnly, judgingCtrl.removeCriterion);

// Organizer: assignments, progress, unlock, settings
router.get('/events/:id/judging/assignments', authenticate, organizerOnly, judgingCtrl.assignments);
router.put('/events/:id/judging/assignments/:judgeId', authenticate, organizerOnly, validate(assignmentsSchema), judgingCtrl.setAssignments);
router.post('/events/:id/judging/auto-assign', authenticate, organizerOnly, validate(autoAssignSchema), judgingCtrl.autoAssign);
router.get('/events/:id/judging/progress', authenticate, organizerOnly, judgingCtrl.progress);
router.post('/events/:id/judging/evaluations/:evaluationId/unlock', authenticate, organizerOnly, judgingCtrl.unlock);
router.patch('/events/:id/judging/settings', authenticate, organizerOnly, validate(judgingSettingsSchema), judgingCtrl.updateSettings);

// Judge
router.get('/me/judging', authenticate, participantOnly, judgingCtrl.myJudging);
router.get('/events/:id/judging/mine', authenticate, participantOnly, judgingCtrl.myTeams);
router.get('/events/:id/judging/teams/:teamId', authenticate, participantOnly, judgingCtrl.teamDetail);
router.put('/events/:id/judging/teams/:teamId/evaluation', authenticate, participantOnly, validate(evaluationSchema), judgingCtrl.saveEvaluation);
router.post('/events/:id/judging/teams/:teamId/evaluation/submit', authenticate, participantOnly, validate(evaluationSchema), judgingCtrl.submitEvaluation);

// Leaderboard (organizer: always, full detail; others: once published)
router.get('/events/:id/leaderboard', authenticate, judgingCtrl.leaderboard);

export default router;
