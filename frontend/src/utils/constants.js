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
  ({ organizer: '/organizer/dashboard', admin: '/admin/dashboard', participant: '/events' })[role] || '/login';

// Banner gradient used when an event has no uploaded image.
export const TYPE_GRADIENTS = {
  Hackathon: 'from-indigo-500 to-violet-600',
  Workshop: 'from-emerald-500 to-teal-600',
  Symposium: 'from-sky-500 to-blue-600',
  Seminar: 'from-amber-500 to-orange-600',
  Competition: 'from-rose-500 to-red-600',
  'Cultural Event': 'from-fuchsia-500 to-pink-600',
  'Technical Event': 'from-cyan-500 to-sky-600',
};

export const SESSION_TYPES = {
  session: { label: 'Session', tone: 'indigo' },
  workshop: { label: 'Workshop', tone: 'green' },
  talk: { label: 'Talk', tone: 'indigo' },
  break: { label: 'Break', tone: 'slate' },
  competition: { label: 'Competition', tone: 'amber' },
  evaluation_round: { label: 'Evaluation round', tone: 'amber' },
};
