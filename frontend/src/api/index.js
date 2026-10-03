import { blobUrl, download, request } from './client.js';

export { ApiError, assetUrl } from './client.js';

export const authApi = {
  register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
  me: (signal) => request('/api/auth/me', { signal }),
  updateProfile: (body) => request('/api/auth/me', { method: 'PATCH', body }),
  verifyEmail: (body) => request('/api/auth/verify-email', { method: 'POST', body, auth: false }),
  resendVerification: (body) => request('/api/auth/resend-verification', { method: 'POST', body, auth: false }),
  changeEmail: (body) => request('/api/auth/change-email', { method: 'POST', body, auth: false }),
  emailPreferences: (signal) => request('/api/auth/email-preferences', { signal }),
  saveEmailPreferences: (body) => request('/api/auth/email-preferences', { method: 'PUT', body }),
};

export const eventsApi = {
  list: (filters = {}, signal) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    const qs = params.toString();
    return request(`/api/events${qs ? `?${qs}` : ''}`, { signal });
  },
  favorite: (id, on) => request(`/api/events/${id}/favorite`, { method: on ? 'POST' : 'DELETE' }),
  mine: (signal) => request('/api/events/mine', { signal }),
  get: (id, signal) => request(`/api/events/${id}`, { signal }),
  create: (formData) => request('/api/events', { method: 'POST', body: formData }),
};

const query = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => value !== '' && value != null && search.set(key, value));
  const qs = search.toString();
  return qs ? `?${qs}` : '';
};

export const organizerApi = {
  stats: (signal) => request('/api/organizer/stats', { signal }),
  activity: (signal) => request('/api/organizer/activity', { signal }),
  participants: (filters, signal) => request(`/api/organizer/participants${query(filters)}`, { signal }),
  exportParticipants: ({ page: _p, pageSize: _s, ...filters }) =>
    download(`/api/organizer/participants/export${query(filters)}`, 'participants.csv'),
};

export const registrationsApi = {
  register: (eventId) => request(`/api/events/${eventId}/registrations`, { method: 'POST' }),
  cancel: (id) => request(`/api/registrations/${id}/cancel`, { method: 'POST' }),
  mine: (signal) => request('/api/registrations/mine', { signal }),
  detail: (id, signal) => request(`/api/registrations/${id}`, { signal }),
  decide: (id, status) => request(`/api/registrations/${id}/status`, { method: 'PATCH', body: { status } }),
};

export const attendanceApi = {
  dashboard: (eventId, filters = {}, signal) => request(`/api/events/${eventId}/attendance${query(filters)}`, { signal }),
  scan: (eventId, code, action, sessionId) =>
    request(`/api/events/${eventId}/attendance/scan`, { method: 'POST', body: { code, action, ...(sessionId ? { sessionId } : {}) } }),
  mark: (eventId, registrationId, action) =>
    request(`/api/events/${eventId}/attendance/manual`, { method: 'POST', body: { registrationId, action } }),
  exportCsv: (eventId) => download(`/api/events/${eventId}/attendance/export`, 'attendance.csv'),
};

export const staffApi = {
  list: (eventId, signal) => request(`/api/events/${eventId}/staff`, { signal }),
  add: (eventId, email, role) => request(`/api/events/${eventId}/staff`, { method: 'POST', body: { email, role } }),
  remove: (eventId, staffId) => request(`/api/events/${eventId}/staff/${staffId}`, { method: 'DELETE' }),
};

export const scheduleApi = {
  list: (eventId, signal) => request(`/api/events/${eventId}/schedule`, { signal }),
  create: (eventId, body) => request(`/api/events/${eventId}/schedule`, { method: 'POST', body }),
  update: (eventId, id, body) => request(`/api/events/${eventId}/schedule/${id}`, { method: 'PATCH', body }),
  remove: (eventId, id) => request(`/api/events/${eventId}/schedule/${id}`, { method: 'DELETE' }),
  myToday: (signal) => request('/api/me/schedule/today', { signal }),
};

export const announcementsApi = {
  list: (eventId, signal) => request(`/api/events/${eventId}/announcements`, { signal }),
  create: (eventId, body) => request(`/api/events/${eventId}/announcements`, { method: 'POST', body }),
};

export const notificationsApi = {
  list: ({ unread, limit, before } = {}, signal) =>
    request(`/api/notifications${query({ unread: unread ? 1 : '', limit, before })}`, { signal }),
  markRead: (id) => request(`/api/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request('/api/notifications/read-all', { method: 'POST' }),
};

export const teamsApi = {
  list: (eventId, signal) => request(`/api/events/${eventId}/teams`, { signal }),
  create: (eventId, body) => request(`/api/events/${eventId}/teams`, { method: 'POST', body }),
  overview: (eventId, signal) => request(`/api/events/${eventId}/teams/overview`, { signal }),
  settings: (eventId, body) => request(`/api/events/${eventId}/team-settings`, { method: 'PATCH', body }),
  detail: (teamId, signal) => request(`/api/teams/${teamId}`, { signal }),
  update: (teamId, body) => request(`/api/teams/${teamId}`, { method: 'PATCH', body }),
  disband: (teamId) => request(`/api/teams/${teamId}`, { method: 'DELETE' }),
  requestToJoin: (teamId) => request(`/api/teams/${teamId}/requests`, { method: 'POST' }),
  invite: (teamId, userId) => request(`/api/teams/${teamId}/invitations`, { method: 'POST', body: { userId } }),
  leave: (teamId) => request(`/api/teams/${teamId}/leave`, { method: 'POST' }),
  removeMember: (teamId, userId) => request(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  suggestions: (teamId, skill, signal) => request(`/api/teams/${teamId}/suggestions${query({ skill })}`, { signal }),
  respond: (invitationId, accept) => request(`/api/invitations/${invitationId}/respond`, { method: 'POST', body: { accept } }),
  cancelInvitation: (invitationId) => request(`/api/invitations/${invitationId}`, { method: 'DELETE' }),
  myInvitations: (signal) => request('/api/me/invitations', { signal }),
  submitProject: (teamId) => request(`/api/teams/${teamId}/submit`, { method: 'POST' }),
};

export const judgingApi = {
  criteria: (eventId, signal) => request(`/api/events/${eventId}/criteria`, { signal }),
  createCriterion: (eventId, body) => request(`/api/events/${eventId}/criteria`, { method: 'POST', body }),
  updateCriterion: (eventId, id, body) => request(`/api/events/${eventId}/criteria/${id}`, { method: 'PATCH', body }),
  removeCriterion: (eventId, id) => request(`/api/events/${eventId}/criteria/${id}`, { method: 'DELETE' }),
  assignments: (eventId, signal) => request(`/api/events/${eventId}/judging/assignments`, { signal }),
  setAssignments: (eventId, judgeId, teamIds) =>
    request(`/api/events/${eventId}/judging/assignments/${judgeId}`, { method: 'PUT', body: { teamIds } }),
  autoAssign: (eventId, judgesPerTeam) => request(`/api/events/${eventId}/judging/auto-assign`, { method: 'POST', body: { judgesPerTeam } }),
  progress: (eventId, signal) => request(`/api/events/${eventId}/judging/progress`, { signal }),
  unlock: (eventId, evaluationId) => request(`/api/events/${eventId}/judging/evaluations/${evaluationId}/unlock`, { method: 'POST' }),
  settings: (eventId, body) => request(`/api/events/${eventId}/judging/settings`, { method: 'PATCH', body }),
  leaderboard: (eventId, signal) => request(`/api/events/${eventId}/leaderboard`, { signal }),
  myEvents: (signal) => request('/api/me/judging', { signal }),
  myTeams: (eventId, signal) => request(`/api/events/${eventId}/judging/mine`, { signal }),
  teamDetail: (eventId, teamId, signal) => request(`/api/events/${eventId}/judging/teams/${teamId}`, { signal }),
  saveEvaluation: (eventId, teamId, body) =>
    request(`/api/events/${eventId}/judging/teams/${teamId}/evaluation`, { method: 'PUT', body }),
  submitEvaluation: (eventId, teamId, body) =>
    request(`/api/events/${eventId}/judging/teams/${teamId}/evaluation/submit`, { method: 'POST', body }),
};

export const certificatesApi = {
  forEvent: (eventId, signal) => request(`/api/events/${eventId}/certificates`, { signal }),
  issue: (eventId, body) => request(`/api/events/${eventId}/certificates`, { method: 'POST', body }),
  revoke: (eventId, id, reason) => request(`/api/events/${eventId}/certificates/${id}/revoke`, { method: 'POST', body: { reason } }),
  mine: (signal) => request('/api/certificates/mine', { signal }),
  download: (code) => download(`/api/certificates/${code}/pdf`, `${code}.pdf`),
  viewUrl: (code) => blobUrl(`/api/certificates/${code}/pdf`),
  previewUrl: (eventId, type) => blobUrl(`/api/events/${eventId}/certificates/preview?type=${encodeURIComponent(type)}`),
  verify: (code, signal) => request(`/api/verify/${encodeURIComponent(code)}`, { signal, auth: false }),
};

export const feedbackApi = {
  mine: (eventId, signal) => request(`/api/events/${eventId}/feedback/mine`, { signal }),
  save: (eventId, body) => request(`/api/events/${eventId}/feedback`, { method: 'PUT', body }),
  summary: (eventId, signal) => request(`/api/events/${eventId}/feedback/summary`, { signal }),
};

export const analyticsApi = {
  get: (filters, signal) => request(`/api/organizer/analytics${query(filters)}`, { signal }),
  exportCsv: (filters) => download(`/api/organizer/analytics/export${query(filters)}`, 'event-analytics.csv'),
};

export const volunteerApi = {
  opportunities: (signal) => request('/api/volunteer/opportunities', { signal }),
  apply: (eventId, message) => request(`/api/events/${eventId}/volunteer-applications`, { method: 'POST', body: { message } }),
  withdraw: (eventId) => request(`/api/events/${eventId}/volunteer-applications/mine`, { method: 'DELETE' }),
  forEvent: (eventId, signal) => request(`/api/events/${eventId}/volunteer-applications`, { signal }),
  decide: (eventId, id, status) => request(`/api/events/${eventId}/volunteer-applications/${id}`, { method: 'PATCH', body: { status } }),
};

export const helpApi = {
  info: (eventId, signal) => request(`/api/events/${eventId}/help/info`, { signal }),
  create: (eventId, formData) => request(`/api/events/${eventId}/help-requests`, { method: 'POST', body: formData }),
  mine: (signal) => request('/api/help-requests/mine', { signal }),
  get: (id, signal) => request(`/api/help-requests/${id}`, { signal }),
  cancel: (id) => request(`/api/help-requests/${id}/cancel`, { method: 'POST' }),
  photoUrl: (id, attachmentId) => blobUrl(`/api/help-requests/${id}/attachments/${attachmentId}`),
  // Volunteers and organizers
  assignedToMe: (signal) => request('/api/volunteer/help-requests', { signal }),
  accept: (id) => request(`/api/help-requests/${id}/accept`, { method: 'PATCH' }),
  setStatus: (id, status, message = '') => request(`/api/help-requests/${id}/status`, { method: 'PATCH', body: { status, message } }),
  addUpdate: (id, message, internal = false) => request(`/api/help-requests/${id}/updates`, { method: 'POST', body: { message, internal } }),
  setItemStatus: (id, itemStatus) => request(`/api/help-requests/${id}/item-status`, { method: 'PATCH', body: { itemStatus } }),
  // Organizers
  forEvent: (eventId, filters = {}, signal) => request(`/api/organizer/events/${eventId}/help-requests${query(filters)}`, { signal }),
  organizerSummary: (signal) => request('/api/organizer/help-summary', { signal }),
  analytics: (eventId, signal) => request(`/api/organizer/events/${eventId}/help-analytics`, { signal }),
  assign: (id, volunteerId) => request(`/api/help-requests/${id}/assign`, { method: 'PATCH', body: { volunteerId } }),
  setPriority: (id, priority, reason = '') => request(`/api/help-requests/${id}/priority`, { method: 'PATCH', body: { priority, reason } }),
  escalate: (id, reason = '') => request(`/api/help-requests/${id}/escalate`, { method: 'PATCH', body: { reason } }),
};

export const adminHelpApi = {
  requests: (filters = {}, signal) => request(`/api/admin/help-requests${query(filters)}`, { signal }),
  analytics: (signal) => request('/api/admin/help-analytics', { signal }),
  categories: (signal) => request('/api/admin/help-categories', { signal }),
  createCategory: (body) => request('/api/admin/help-categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/api/admin/help-categories/${id}`, { method: 'PUT', body }),
  contacts: (signal) => request('/api/admin/emergency-contacts', { signal }),
  createContact: (body) => request('/api/admin/emergency-contacts', { method: 'POST', body }),
  updateContact: (id, body) => request(`/api/admin/emergency-contacts/${id}`, { method: 'PUT', body }),
  teams: (signal) => request('/api/admin/help-teams', { signal }),
  createTeam: (body) => request('/api/admin/help-teams', { method: 'POST', body }),
  updateTeam: (id, body) => request(`/api/admin/help-teams/${id}`, { method: 'PUT', body }),
  addMember: (id, email) => request(`/api/admin/help-teams/${id}/members`, { method: 'POST', body: { email } }),
  removeMember: (id, userId) => request(`/api/admin/help-teams/${id}/members/${userId}`, { method: 'DELETE' }),
  settings: (signal) => request('/api/admin/help-settings', { signal }),
  saveSettings: (body) => request('/api/admin/help-settings', { method: 'PUT', body }),
};

export const adminEmailApi = {
  status: (signal) => request('/api/admin/email-status', { signal }),
  logs: (filters = {}, signal) => request(`/api/admin/email-logs${query(filters)}`, { signal }),
  test: () => request('/api/admin/email-test', { method: 'POST', body: {} }),
};

export const volunteerOpsApi = {
  // Organizer
  overview: (eventId, signal) => request(`/api/events/${eventId}/volunteer-overview`, { signal }),
  volunteers: (eventId, filters = {}, signal) => request(`/api/events/${eventId}/volunteers${query(filters)}`, { signal }),
  volunteer: (eventId, userId, signal) => request(`/api/events/${eventId}/volunteers/${userId}`, { signal }),
  updateVolunteer: (eventId, userId, body) => request(`/api/events/${eventId}/volunteers/${userId}`, { method: 'PUT', body }),
  departments: (eventId, signal) => request(`/api/events/${eventId}/volunteer-departments`, { signal }),
  createDepartment: (eventId, body) => request(`/api/events/${eventId}/volunteer-departments`, { method: 'POST', body }),
  updateDepartment: (id, body) => request(`/api/volunteer-departments/${id}`, { method: 'PUT', body }),
  deleteDepartment: (id) => request(`/api/volunteer-departments/${id}`, { method: 'DELETE' }),
  shifts: (eventId, signal) => request(`/api/events/${eventId}/volunteer-shifts`, { signal }),
  createShift: (eventId, body) => request(`/api/events/${eventId}/volunteer-shifts`, { method: 'POST', body }),
  updateShift: (id, body) => request(`/api/volunteer-shifts/${id}`, { method: 'PUT', body }),
  deleteShift: (id) => request(`/api/volunteer-shifts/${id}`, { method: 'DELETE' }),
  assignments: (eventId, filters = {}, signal) => request(`/api/events/${eventId}/volunteer-assignments${query(filters)}`, { signal }),
  assign: (eventId, body) => request(`/api/events/${eventId}/volunteer-assignments`, { method: 'POST', body }),
  updateAssignment: (id, body) => request(`/api/volunteer-assignments/${id}`, { method: 'PUT', body }),
  removeAssignment: (id, reason = '') => request(`/api/volunteer-assignments/${id}`, { method: 'DELETE', body: { reason } }),
  tasks: (eventId, filters = {}, signal) => request(`/api/events/${eventId}/volunteer-tasks${query(filters)}`, { signal }),
  createTask: (eventId, body) => request(`/api/events/${eventId}/volunteer-tasks`, { method: 'POST', body }),
  updateTask: (id, body) => request(`/api/volunteer-tasks/${id}`, { method: 'PUT', body }),
  attendance: (eventId, date, signal) => request(`/api/events/${eventId}/volunteer-attendance${query({ date })}`, { signal }),
  announcements: (eventId, signal) => request(`/api/events/${eventId}/volunteer-announcements`, { signal }),
  announce: (eventId, body) => request(`/api/events/${eventId}/volunteer-announcements`, { method: 'POST', body }),
  reassignments: (eventId, signal) => request(`/api/events/${eventId}/volunteer-reassignments`, { signal }),
  decideReassignment: (id, status, note = '') => request(`/api/volunteer-reassignments/${id}`, { method: 'PATCH', body: { status, note } }),
  analytics: (eventId, signal) => request(`/api/events/${eventId}/volunteer-analytics`, { signal }),
  audit: (eventId, signal) => request(`/api/events/${eventId}/volunteer-audit`, { signal }),
  // Applications (organizer decides, student applies)
  applications: (eventId, signal) => request(`/api/events/${eventId}/volunteer-applications`, { signal }),
  decideApplication: (eventId, id, status) => request(`/api/events/${eventId}/volunteer-applications/${id}`, { method: 'PATCH', body: { status } }),
  apply: (eventId, body) => request(`/api/events/${eventId}/volunteers/apply`, { method: 'POST', body }),
  // The volunteer's own area
  dashboard: (signal) => request('/api/volunteer/dashboard', { signal }),
  myTasks: (signal) => request('/api/volunteer/tasks', { signal }),
  mySchedule: (signal) => request('/api/volunteer/schedule', { signal }),
  myHistory: (signal) => request('/api/volunteer/history', { signal }),
  myAnnouncements: (signal) => request('/api/volunteer/announcements', { signal }),
  profile: (signal) => request('/api/volunteer/profile', { signal }),
  saveProfile: (body) => request('/api/volunteer/profile', { method: 'PUT', body }),
  accept: (id) => request(`/api/volunteer-assignments/${id}/accept`, { method: 'POST' }),
  checkIn: (id) => request(`/api/volunteer-assignments/${id}/check-in`, { method: 'POST' }),
  checkOut: (id) => request(`/api/volunteer-assignments/${id}/check-out`, { method: 'POST' }),
  setBreak: (id, onBreak) => request(`/api/volunteer-assignments/${id}/break`, { method: 'POST', body: { onBreak } }),
  requestReassignment: (id, reason) => request(`/api/volunteer-assignments/${id}/reassignment`, { method: 'POST', body: { reason } }),
  acceptTask: (id) => request(`/api/volunteer-tasks/${id}/accept`, { method: 'POST' }),
  startTask: (id) => request(`/api/volunteer-tasks/${id}/start`, { method: 'POST' }),
  completeTask: (id) => request(`/api/volunteer-tasks/${id}/complete`, { method: 'POST' }),
};

export const adminVolunteerApi = {
  analytics: (signal) => request('/api/admin/volunteer-analytics', { signal }),
  activity: (filters = {}, signal) => request(`/api/admin/volunteer-activity${query(filters)}`, { signal }),
  volunteers: (filters = {}, signal) => request(`/api/admin/volunteers${query(filters)}`, { signal }),
  setStatus: (userId, status) => request(`/api/admin/volunteers/${userId}`, { method: 'PUT', body: { status } }),
  categories: (signal) => request('/api/admin/volunteer-categories', { signal }),
  createCategory: (body) => request('/api/admin/volunteer-categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/api/admin/volunteer-categories/${id}`, { method: 'PUT', body }),
  settings: (signal) => request('/api/admin/volunteer-settings', { signal }),
  saveSettings: (body) => request('/api/admin/volunteer-settings', { method: 'PUT', body }),
};

export const meApi = {
  assignments: (signal) => request('/api/me/assignments', { signal }),
};

export const adminApi = {
  stats: (signal) => request('/api/admin/stats', { signal }),
};

export const insightsApi = {
  recommendations: (eventId, signal) => request(`/api/events/${eventId}/recommendations`, { signal }),
  setStatus: (eventId, id, status) => request(`/api/events/${eventId}/recommendations/${id}`, { method: 'PATCH', body: { status } }),
  askAi: (eventId) => request(`/api/events/${eventId}/recommendations/ai`, { method: 'POST' }),
  controlCenter: (eventId, signal) => request(`/api/events/${eventId}/control-center`, { signal }),
  zones: (eventId, signal) => request(`/api/events/${eventId}/zones`, { signal }),
  addZone: (eventId, name) => request(`/api/events/${eventId}/zones`, { method: 'POST', body: { name } }),
  reportZone: (eventId, zoneId, body) => request(`/api/events/${eventId}/zones/${zoneId}`, { method: 'PATCH', body }),
  removeZone: (eventId, zoneId) => request(`/api/events/${eventId}/zones/${zoneId}`, { method: 'DELETE' }),
};

export const studentApi = {
  dashboard: (signal) => request('/api/me/dashboard', { signal }),
};

export const publicApi = {
  stats: (signal) => request('/api/public/stats', { signal, auth: false }),
};
