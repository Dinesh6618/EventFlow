import { request } from './client.js';

export { ApiError, assetUrl } from './client.js';

export const authApi = {
  register: (body) => request('/api/auth/register', { method: 'POST', body, auth: false }),
  login: (body) => request('/api/auth/login', { method: 'POST', body, auth: false }),
  me: (signal) => request('/api/auth/me', { signal }),
  updateProfile: (body) => request('/api/auth/me', { method: 'PATCH', body }),
};

export const eventsApi = {
  list: ({ q, type, date } = {}, signal) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (type) params.set('type', type);
    if (date) params.set('date', date);
    const qs = params.toString();
    return request(`/api/events${qs ? `?${qs}` : ''}`, { signal });
  },
  mine: (signal) => request('/api/events/mine', { signal }),
  get: (id, signal) => request(`/api/events/${id}`, { signal }),
  create: (formData) => request('/api/events', { method: 'POST', body: formData }),
};

export const organizerApi = {
  stats: (signal) => request('/api/organizer/stats', { signal }),
  participants: (signal) => request('/api/organizer/participants', { signal }),
};

export const adminApi = {
  stats: (signal) => request('/api/admin/stats', { signal }),
};
