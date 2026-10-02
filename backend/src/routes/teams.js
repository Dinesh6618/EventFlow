import { Router } from 'express';
import * as teamCtrl from '../controllers/teamController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { inviteSchema, respondSchema, suggestionsQuerySchema, teamSchema, teamSettingsSchema } from '../validators/teamValidators.js';

const router = Router();
const participantOnly = requireRole(ROLES.PARTICIPANT);
const organizerOnly = requireRole(ROLES.ORGANIZER);
// Reading teams is also open to the organizer and to event staff; the controller enforces who exactly.
const signedIn = authenticate;

router.get('/events/:id/teams', signedIn, teamCtrl.list);
router.post('/events/:id/teams', signedIn, participantOnly, validate(teamSchema), teamCtrl.create);
router.get('/events/:id/teams/overview', signedIn, organizerOnly, teamCtrl.overview);
router.patch('/events/:id/team-settings', signedIn, organizerOnly, validate(teamSettingsSchema), teamCtrl.updateSettings);

router.get('/teams/:teamId', signedIn, teamCtrl.detail);
router.patch('/teams/:teamId', signedIn, participantOnly, validate(teamSchema), teamCtrl.update);
router.delete('/teams/:teamId', signedIn, teamCtrl.disband);
router.post('/teams/:teamId/submit', signedIn, participantOnly, teamCtrl.submitProject);
router.post('/teams/:teamId/requests', signedIn, participantOnly, teamCtrl.requestToJoin);
router.post('/teams/:teamId/invitations', signedIn, participantOnly, validate(inviteSchema), teamCtrl.invite);
router.post('/teams/:teamId/leave', signedIn, participantOnly, teamCtrl.leave);
router.delete('/teams/:teamId/members/:userId', signedIn, participantOnly, teamCtrl.removeMember);
router.get('/teams/:teamId/suggestions', signedIn, validate(suggestionsQuerySchema, 'query'), teamCtrl.suggestions);

router.get('/me/invitations', signedIn, participantOnly, teamCtrl.myInvitations);
router.post('/invitations/:id/respond', signedIn, participantOnly, validate(respondSchema), teamCtrl.respond);
router.delete('/invitations/:id', signedIn, participantOnly, teamCtrl.cancelInvitation);

export default router;
