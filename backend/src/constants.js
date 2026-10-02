export const ROLES = Object.freeze({
  ORGANIZER: 'organizer',
  PARTICIPANT: 'participant',
  ADMIN: 'admin',
});

// Roles a person may pick when registering. Admin accounts are created by seeding only.
export const SELF_REGISTER_ROLES = [ROLES.ORGANIZER, ROLES.PARTICIPANT];

export const EVENT_TYPES = [
  'Hackathon',
  'Workshop',
  'Symposium',
  'Seminar',
  'Competition',
  'Cultural Event',
  'Technical Event',
];
