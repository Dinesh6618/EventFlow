import { Router } from 'express';
import * as helpCtrl from '../controllers/helpController.js';
import * as adminCtrl from '../controllers/helpAdminController.js';
import { ROLES } from '../constants.js';
import { config } from '../config.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { uploadHelpPhoto } from '../middleware/helpUpload.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
  assignSchema, categoryCreateSchema, categoryUpdateSchema, contactCreateSchema, contactUpdateSchema, createHelpSchema, escalateSchema,
  escalationSchema, itemStatusSchema, listHelpQuery, prioritySchema, statusSchema, teamCreateSchema, teamMemberSchema, teamUpdateSchema, updateSchema,
} from '../validators/helpValidators.js';

const router = Router();
const participant = [authenticate, requireRole(ROLES.PARTICIPANT)];
const organizer = [authenticate, requireRole(ROLES.ORGANIZER)];
const admin = [authenticate, requireRole(ROLES.ADMIN)];

// A few requests per person is plenty, and it stops anyone flooding the event team.
const createLimit = rateLimit({ name: 'help-create', windowMs: 10 * 60 * 1000, max: config.help.createLimit, key: (req) => `help:${req.user.id}` });

// Participant. Volunteers are participants too; what they may touch is decided per request.
router.get('/events/:eventId/help/info', authenticate, requireRole(ROLES.PARTICIPANT, ROLES.ORGANIZER), helpCtrl.info);
router.post('/events/:eventId/help-requests', ...participant, createLimit, uploadHelpPhoto, validate(createHelpSchema), helpCtrl.create);
router.get('/events/:eventId/help-requests/my', ...participant, helpCtrl.mine);
router.get('/help-requests/mine', ...participant, helpCtrl.mine);

// Volunteer
router.get('/volunteer/help-requests', ...participant, helpCtrl.volunteerList);
router.patch('/help-requests/:id/accept', ...participant, helpCtrl.accept);

// Shared: who may see or do what is decided inside each handler.
router.get('/help-requests/:id', authenticate, helpCtrl.get);
router.get('/help-requests/:id/attachments/:attId', authenticate, helpCtrl.attachment);
router.post('/help-requests/:id/cancel', ...participant, helpCtrl.cancel);
router.patch('/help-requests/:id/status', authenticate, requireRole(ROLES.PARTICIPANT, ROLES.ORGANIZER), validate(statusSchema), helpCtrl.setStatus);
router.post('/help-requests/:id/updates', authenticate, requireRole(ROLES.PARTICIPANT, ROLES.ORGANIZER), validate(updateSchema), helpCtrl.addUpdate);
router.patch('/help-requests/:id/item-status', authenticate, requireRole(ROLES.PARTICIPANT, ROLES.ORGANIZER), validate(itemStatusSchema), helpCtrl.setItemStatus);

// Organizer
router.get('/organizer/help-summary', ...organizer, helpCtrl.organizerSummary);
router.get('/organizer/events/:eventId/help-requests', ...organizer, validate(listHelpQuery, 'query'), helpCtrl.organizerList);
router.get('/organizer/events/:eventId/help-analytics', ...organizer, helpCtrl.eventAnalytics);
router.patch('/help-requests/:id/assign', ...organizer, validate(assignSchema), helpCtrl.assign);
router.patch('/help-requests/:id/priority', ...organizer, validate(prioritySchema), helpCtrl.setPriority);
router.patch('/help-requests/:id/escalate', ...organizer, validate(escalateSchema), helpCtrl.escalate);

// Admin
router.get('/admin/help-requests', ...admin, validate(listHelpQuery, 'query'), adminCtrl.requests);
router.get('/admin/help-analytics', ...admin, adminCtrl.analytics);
router.get('/admin/help-categories', ...admin, adminCtrl.listCategories);
router.post('/admin/help-categories', ...admin, validate(categoryCreateSchema), adminCtrl.createCategory);
router.put('/admin/help-categories/:id', ...admin, validate(categoryUpdateSchema), adminCtrl.updateCategory);
router.get('/admin/emergency-contacts', ...admin, adminCtrl.listContacts);
router.post('/admin/emergency-contacts', ...admin, validate(contactCreateSchema), adminCtrl.createContact);
router.put('/admin/emergency-contacts/:id', ...admin, validate(contactUpdateSchema), adminCtrl.updateContact);
router.get('/admin/help-teams', ...admin, adminCtrl.listTeams);
router.post('/admin/help-teams', ...admin, validate(teamCreateSchema), adminCtrl.createTeam);
router.put('/admin/help-teams/:id', ...admin, validate(teamUpdateSchema), adminCtrl.updateTeam);
router.post('/admin/help-teams/:id/members', ...admin, validate(teamMemberSchema), adminCtrl.addTeamMember);
router.delete('/admin/help-teams/:id/members/:userId', ...admin, adminCtrl.removeTeamMember);
router.get('/admin/help-settings', ...admin, adminCtrl.getSettings);
router.put('/admin/help-settings', ...admin, validate(escalationSchema), adminCtrl.saveSettings);

export default router;
