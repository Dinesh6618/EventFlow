import { download, request } from './client.js';

export { ApiError, assetUrl } from './client.js';

export const authApi = {
  register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
  me: (signal) => request('/api/auth/me', { signal }),
  updateProfile: (body) => request('/api/auth/me', { method: 'PATCH', body }),
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

export const aiApi = {
  status: (signal) => request('/api/organizer/ai/status', { signal }),
  list: (signal) => request('/api/organizer/ai/plans', { signal }),
  get: (id, signal) => request(`/api/organizer/ai/plans/${id}`, { signal }),
  generate: (body) => request('/api/organizer/ai/plans', { method: 'POST', body }),
  save: (id, plan) => request(`/api/organizer/ai/plans/${id}`, { method: 'PUT', body: { plan } }),
  suggestSchedule: (id, body) => request(`/api/organizer/ai/plans/${id}/schedule`, { method: 'POST', body }),
  confirm: (id) => request(`/api/organizer/ai/plans/${id}/confirm`, { method: 'POST' }),
  publish: (id, body) => request(`/api/organizer/ai/plans/${id}/publish`, { method: 'POST', body }),
  remove: (id) => request(`/api/organizer/ai/plans/${id}`, { method: 'DELETE' }),
  forEvent: (eventId, signal) => request(`/api/organizer/ai/events/${eventId}/plan`, { signal }),
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
