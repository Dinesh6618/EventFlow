const parseDate = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** '2026-10-14' -> 'Wed, 14 Oct 2026' */
export function formatDate(value) {
  if (!value) return '';
  return parseDate(value).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** '14:00' -> '2:00 PM' */
export function formatTime(value) {
  if (!value) return '';
  const [h, m] = value.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const formatTimeRange = (start, end) => `${formatTime(start)} - ${formatTime(end)}`;

/** '2026-10-14T17:00' -> 'Wed, 14 Oct 2026, 5:00 PM' */
export function formatDateTime(value) {
  if (!value) return '';
  const [date, time] = value.split('T');
  return `${formatDate(date)}, ${formatTime(time)}`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Today as 'YYYY-MM-DD' in local time. */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Now as 'YYYY-MM-DDTHH:mm' in local time. */
export function nowLocalISO() {
  const d = new Date();
  return `${todayISO()}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'Sat, 3 Oct 2026' for one day, 'Sat, 3 Oct - Sun, 4 Oct 2026' for a multi-day event. */
export function formatEventDates(event) {
  const start = event.date;
  const end = event.endDate || event.date;
  if (start === end) return formatDate(start);
  const short = (value) =>
    parseDate(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${short(start)} - ${short(end)} ${end.slice(0, 4)}`;
}

/** Date plus time range; multi-day events show start and end times against their own days. */
export function formatEventWhen(event) {
  if ((event.endDate || event.date) === event.date) return `${formatDate(event.date)}, ${formatTimeRange(event.startTime, event.endTime)}`;
  return `${formatEventDates(event)} (${formatTime(event.startTime)} to ${formatTime(event.endTime)})`;
}

/** 45 -> '45 seconds', 840 -> '14 minutes', 3600 -> '1 hour': how long until something may be tried again. */
export function formatWait(seconds) {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 90) return `${s} second${s === 1 ? '' : 's'}`;
  const minutes = Math.ceil(s / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/** 75 -> '1:15', 9 -> '9s': a short countdown for a button label. */
export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
