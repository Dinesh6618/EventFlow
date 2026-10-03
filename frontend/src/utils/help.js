import { todayISO } from './format.js';

// Calm colours on purpose: urgent things stand out by label and tone, not by flashing.
export const STATUS_META = {
  reported: { label: 'Reported', tone: 'amber', dot: '🟠' },
  acknowledged: { label: 'Acknowledged', tone: 'blue', dot: '🔵' },
  assigned: { label: 'Assigned', tone: 'indigo', dot: '🟣' },
  in_progress: { label: 'In progress', tone: 'pink', dot: '🟡' },
  resolved: { label: 'Resolved', tone: 'green', dot: '🟢' },
  closed: { label: 'Closed', tone: 'slate', dot: '⚪' },
  cancelled: { label: 'Cancelled', tone: 'slate', dot: '⚫' },
};

export const STATUS_FLOW = ['reported', 'acknowledged', 'assigned', 'in_progress', 'resolved', 'closed'];

export const PRIORITY_META = {
  low: { label: 'Low', tone: 'slate' },
  medium: { label: 'Medium', tone: 'blue' },
  high: { label: 'High', tone: 'amber' },
  urgent: { label: 'Urgent', tone: 'red' },
};
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const ITEM_STATUS_LABEL = { open: 'Still missing', found: 'Found', claimed: 'Claimed', returned: 'Returned' };

export const CONTACT_PREFERENCES = [
  { value: 'app', label: 'Update me in the app' },
  { value: 'in_person', label: 'Come to my location' },
  { value: 'call', label: 'Call me' },
];

/** Same rule as the server: help is available on the day of the event, or while it runs. */
export function isHelpWindow({ status, date, endDate }) {
  if (status === 'ongoing') return true;
  const today = todayISO();
  return Boolean(date) && today >= date && today <= (endDate || date);
}

/** "10:05" for a timeline entry. */
export const clockTime = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "12 min" / "2 h 5 min" for a number of minutes. */
export function durationText(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}
