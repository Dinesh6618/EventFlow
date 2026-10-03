import { formatTime } from './format.js';

// Calm, readable statuses. Colour only reinforces the label.
export const DUTY_STATUS = {
  available: { label: 'Available', tone: 'slate' },
  assigned: { label: 'Assigned', tone: 'indigo' },
  checked_in: { label: 'Checked in', tone: 'green' },
  active: { label: 'Active', tone: 'green' },
  on_break: { label: 'On break', tone: 'amber' },
  completed: { label: 'Completed', tone: 'blue' },
  absent: { label: 'Absent', tone: 'red' },
  inactive: { label: 'Deactivated', tone: 'slate' },
};

export const ATTENDANCE = {
  not_checked_in: { label: 'Not checked in', tone: 'slate' },
  checked_in: { label: 'Checked in', tone: 'green' },
  checked_out: { label: 'Checked out', tone: 'blue' },
  absent: { label: 'Absent', tone: 'red' },
};

export const TASK_STATUS = {
  assigned: { label: 'Assigned', tone: 'indigo' },
  accepted: { label: 'Accepted', tone: 'blue' },
  in_progress: { label: 'In progress', tone: 'amber' },
  completed: { label: 'Completed', tone: 'green' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
};

export const APPLICATION_STATUS = {
  pending: { label: 'Pending', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  declined: { label: 'Rejected', tone: 'red' },
};

export const AVAILABILITY = ['Full day', 'Morning', 'Afternoon', 'Evening', 'Weekends only', 'Flexible'];

/** "8:30 AM - 11:30 AM" */
export const shiftText = (start, end) => `${formatTime(start)} - ${formatTime(end)}`;

/** "2 h 15 min" for a number of minutes. */
export function minutesText(minutes) {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

/** Skills typed as "Python, Web Development" become a clean list, and back. */
export const parseSkills = (text) => [...new Set(text.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 15);
