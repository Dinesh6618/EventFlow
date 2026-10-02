export const EVENT_TYPES = [
  'Hackathon',
  'Workshop',
  'Symposium',
  'Seminar',
  'Competition',
  'Cultural Event',
  'Technical Event',
];

export const ROLES = { ORGANIZER: 'organizer', PARTICIPANT: 'participant', ADMIN: 'admin' };

/** Where each role lands after login. */
export const homePathFor = (role) =>
  ({ organizer: '/organizer/dashboard', admin: '/admin/dashboard', participant: '/home' })[role] || '/login';

// Banner gradient used when an event has no uploaded image.
export const TYPE_GRADIENTS = {
  Hackathon: 'from-violet-600 via-indigo-600 to-blue-600',
  Workshop: 'from-emerald-500 via-teal-500 to-cyan-600',
  Symposium: 'from-sky-500 via-blue-600 to-indigo-700',
  Seminar: 'from-amber-500 via-orange-500 to-rose-500',
  Competition: 'from-rose-500 via-pink-600 to-fuchsia-600',
  'Cultural Event': 'from-fuchsia-500 via-pink-500 to-orange-400',
  'Technical Event': 'from-cyan-500 via-sky-600 to-indigo-600',
};

export const TYPE_ICONS = {
  Hackathon: 'zap',
  Workshop: 'layers',
  Symposium: 'users',
  Seminar: 'book',
  Competition: 'trophy',
  'Cultural Event': 'sparkles',
  'Technical Event': 'settings',
};

export const EVENT_MODES = [
  { value: 'offline', label: 'In person' },
  { value: 'online', label: 'Online' },
  { value: 'hybrid', label: 'Hybrid' },
];

export const modeLabel = (mode) => EVENT_MODES.find((m) => m.value === mode)?.label ?? 'In person';

export const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Artificial Intelligence & Data Science',
  'Electronics',
  'Electrical',
  'Mechanical',
  'Civil',
  'Biotechnology',
  'Management',
];

export const YEARS = [
  { value: 1, label: '1st year' },
  { value: 2, label: '2nd year' },
  { value: 3, label: '3rd year' },
  { value: 4, label: '4th year' },
  { value: 5, label: 'Postgraduate' },
];

export const yearLabel = (year) => YEARS.find((y) => y.value === Number(year))?.label ?? '';

export const SESSION_TYPES = {
  session: { label: 'Session', tone: 'indigo' },
  workshop: { label: 'Workshop', tone: 'green' },
  talk: { label: 'Talk', tone: 'indigo' },
  break: { label: 'Break', tone: 'slate' },
  competition: { label: 'Competition', tone: 'amber' },
  evaluation_round: { label: 'Evaluation round', tone: 'amber' },
};
