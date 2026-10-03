import { Router } from 'express';
import * as adminCtrl from '../controllers/volunteerAdminController.js';
import * as ctrl from '../controllers/volunteerOpsController.js';
import * as applyCtrl from '../controllers/volunteerController.js';
import { ROLES } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { applySchema } from '../validators/volunteerValidators.js';
import {
  adminListQuery, announcementCreateSchema, assignmentCreateSchema, assignmentListQuery, assignmentUpdateSchema, attendanceQuery, breakSchema, categoryCreateSchema,
  categoryUpdateSchema, departmentCreateSchema, departmentUpdateSchema, profileUpdateSchema, reassignmentDecisionSchema, reassignmentSchema, removeSchema, settingsSchema,
  shiftCreateSchema, shiftUpdateSchema, suspendSchema, taskCreateSchema, taskListQuery, taskUpdateSchema, volunteerListQuery, volunteerUpdateSchema,
} from '../validators/volunteerOpsValidators.js';

const router = Router();
const organizer = [authenticate, requireRole(ROLES.ORGANIZER)];
const participant = [authenticate, requireRole(ROLES.PARTICIPANT)];
const either = [authenticate, requireRole(ROLES.ORGANIZER, ROLES.PARTICIPANT)];
const admin = [authenticate, requireRole(ROLES.ADMIN)];

// Duty actions are cheap to fire and easy to spam, so cap them per person.
const dutyLimit = rateLimit({ name: 'volunteer-duty', windowMs: 60_000, max: 30, key: (req) => `vduty:${req.user.id}` });
const announceLimit = rateLimit({ name: 'volunteer-announce', windowMs: 60_000, max: 10, key: (req) => `vannounce:${req.user.id}` });

// Students apply (also reachable at this shorter path; the original /volunteer-applications routes still work)
router.post('/events/:id/volunteers/apply', ...participant, validate(applySchema), applyCtrl.apply);

// Organizer: overview, volunteers, attendance, reports
router.get('/events/:eventId/volunteer-overview', ...organizer, ctrl.overview);
router.get('/events/:eventId/volunteers', ...organizer, validate(volunteerListQuery, 'query'), ctrl.volunteerList);
router.get('/events/:eventId/volunteers/:userId', ...organizer, ctrl.volunteerDetail);
router.put('/events/:eventId/volunteers/:userId', ...organizer, validate(volunteerUpdateSchema), ctrl.volunteerUpdate);
router.get('/events/:eventId/volunteer-analytics', ...organizer, ctrl.analytics);
router.get('/events/:eventId/volunteer-audit', ...organizer, ctrl.eventAudit);
router.get('/events/:eventId/volunteer-attendance', ...organizer, validate(attendanceQuery, 'query'), ctrl.attendance);

// Departments and shifts
router.get('/events/:eventId/volunteer-departments', ...organizer, ctrl.listDepartments);
router.post('/events/:eventId/volunteer-departments', ...organizer, validate(departmentCreateSchema), ctrl.createDepartment);
router.put('/volunteer-departments/:id', ...organizer, validate(departmentUpdateSchema), ctrl.updateDepartment);
router.delete('/volunteer-departments/:id', ...organizer, ctrl.deleteDepartment);
router.get('/events/:eventId/volunteer-shifts', ...organizer, ctrl.listShifts);
router.post('/events/:eventId/volunteer-shifts', ...organizer, validate(shiftCreateSchema), ctrl.createShift);
router.put('/volunteer-shifts/:id', ...organizer, validate(shiftUpdateSchema), ctrl.updateShift);
router.delete('/volunteer-shifts/:id', ...organizer, ctrl.deleteShift);

// Assignments, duty attendance and reassignment requests
router.get('/events/:eventId/volunteer-assignments', ...organizer, validate(assignmentListQuery, 'query'), ctrl.listAssignments);
router.post('/events/:eventId/volunteer-assignments', ...organizer, validate(assignmentCreateSchema), ctrl.createAssignment);
router.put('/volunteer-assignments/:id', ...organizer, validate(assignmentUpdateSchema), ctrl.updateAssignment);
router.delete('/volunteer-assignments/:id', ...organizer, validate(removeSchema), ctrl.removeAssignment);
router.post('/volunteer-assignments/:id/accept', ...participant, dutyLimit, ctrl.acceptAssignment);
router.post('/volunteer-assignments/:id/check-in', ...either, dutyLimit, ctrl.checkIn);
router.post('/volunteer-assignments/:id/check-out', ...either, dutyLimit, ctrl.checkOut);
router.post('/volunteer-assignments/:id/break', ...participant, dutyLimit, validate(breakSchema), ctrl.setBreak);
router.post('/volunteer-assignments/:id/reassignment', ...participant, dutyLimit, validate(reassignmentSchema), ctrl.requestReassignment);
router.get('/events/:eventId/volunteer-reassignments', ...organizer, ctrl.listReassignments);
router.patch('/volunteer-reassignments/:id', ...organizer, validate(reassignmentDecisionSchema), ctrl.decideReassignment);

// Tasks
router.get('/events/:eventId/volunteer-tasks', ...organizer, validate(taskListQuery, 'query'), ctrl.listTasks);
router.post('/events/:eventId/volunteer-tasks', ...organizer, validate(taskCreateSchema), ctrl.createTask);
router.put('/volunteer-tasks/:id', ...organizer, validate(taskUpdateSchema), ctrl.updateTask);
router.post('/volunteer-tasks/:id/accept', ...participant, dutyLimit, ctrl.acceptTask);
router.post('/volunteer-tasks/:id/start', ...participant, dutyLimit, ctrl.startTask);
router.post('/volunteer-tasks/:id/complete', ...either, dutyLimit, ctrl.completeTask);

// Announcements to volunteers
router.get('/events/:eventId/volunteer-announcements', ...organizer, ctrl.listAnnouncements);
router.post('/events/:eventId/volunteer-announcements', ...organizer, announceLimit, validate(announcementCreateSchema), ctrl.createAnnouncement);

// The volunteer's own area
router.get('/volunteer/dashboard', ...participant, ctrl.myDashboard);
router.get('/volunteer/tasks', ...participant, ctrl.myTasks);
router.get('/volunteer/schedule', ...participant, ctrl.mySchedule);
router.get('/volunteer/history', ...participant, ctrl.myHistory);
router.get('/volunteer/announcements', ...participant, ctrl.myAnnouncements);
router.get('/volunteer/profile', ...participant, ctrl.myProfile);
router.put('/volunteer/profile', ...participant, validate(profileUpdateSchema), ctrl.updateMyProfile);

// Admin
router.get('/admin/volunteer-analytics', ...admin, adminCtrl.analytics);
router.get('/admin/volunteer-activity', ...admin, validate(adminListQuery, 'query'), adminCtrl.activity);
router.get('/admin/volunteer-audit', ...admin, validate(adminListQuery, 'query'), adminCtrl.audit);
router.get('/admin/volunteers', ...admin, validate(adminListQuery, 'query'), adminCtrl.volunteers);
router.put('/admin/volunteers/:userId', ...admin, validate(suspendSchema), adminCtrl.setVolunteerStatus);
router.get('/admin/volunteer-categories', ...admin, adminCtrl.listCategories);
router.post('/admin/volunteer-categories', ...admin, validate(categoryCreateSchema), adminCtrl.createCategory);
router.put('/admin/volunteer-categories/:id', ...admin, validate(categoryUpdateSchema), adminCtrl.updateCategory);
router.get('/admin/volunteer-settings', ...admin, adminCtrl.getSettings);
router.put('/admin/volunteer-settings', ...admin, validate(settingsSchema), adminCtrl.saveSettings);

export default router;
