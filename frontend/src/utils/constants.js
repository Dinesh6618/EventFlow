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

// `description` explains each type to the organizer when they pick it.
export const SESSION_TYPES = {
  session: { label: 'Session', tone: 'indigo', description: 'A general programme item that does not fit the other types.' },
  registration: { label: 'Registration / check-in', tone: 'blue', description: 'Desk or gate where participants arrive, collect passes and are checked in.' },
  ceremony: { label: 'Ceremony', tone: 'pink', description: 'Inauguration, welcome address, prize distribution or valedictory.' },
  keynote: { label: 'Keynote', tone: 'indigo', description: 'A headline talk by a guest speaker. Add the speaker name below.' },
  talk: { label: 'Talk', tone: 'indigo', description: 'A speaker presenting to the audience, usually followed by questions.' },
  panel: { label: 'Panel discussion', tone: 'indigo', description: 'Several speakers discussing a topic with a moderator. List them in Speaker.' },
  workshop: { label: 'Workshop', tone: 'green', description: 'Hands-on learning. Mention what to bring (laptop, software) in the description.' },
  presentation: { label: 'Presentation / demo', tone: 'green', description: 'Participants or teams present their work, papers or projects.' },
  competition: { label: 'Competition', tone: 'amber', description: 'A contest round such as a coding sprint, quiz or hackathon block.' },
  evaluation_round: { label: 'Evaluation round', tone: 'amber', description: 'Judges review and score entries.' },
  mentoring: { label: 'Mentoring', tone: 'green', description: 'Mentors meet teams to give feedback and guidance.' },
  networking: { label: 'Networking', tone: 'blue', description: 'Open time for participants, speakers and sponsors to meet.' },
  break: { label: 'Break', tone: 'slate', description: 'Tea, lunch or rest. Not counted for session check-in or feedback.' },
};

export const SESSION_TYPE_OPTIONS = Object.entries(SESSION_TYPES).map(([value, { label }]) => ({ value, label }));

/** Seconds before another email can be requested for the same address. The server enforces it and says if it differs. */
export const EMAIL_COOLDOWN_SECONDS = 60;
