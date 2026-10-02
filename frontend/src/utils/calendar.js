// Small helpers for dates shown as chips and for "Add to calendar" files.

/** '2026-10-14' -> { month: 'OCT', day: '14' } */
export function dateChip(value) {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return { month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), day: String(d) };
}

const icsStamp = (date, time) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
const icsText = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/**
 * Build an .ics calendar file for an event. Times are written as "floating" local times (no timezone),
 * which matches how EventFlow stores them.
 */
export function buildIcs(event) {
  const endDate = event.endDate || event.date;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EventFlow//Events//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:event-${event.id}@eventflow`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${icsStamp(event.date, event.startTime)}`,
    `DTEND:${icsStamp(endDate, event.endTime)}`,
    `SUMMARY:${icsText(event.name)}`,
    `LOCATION:${icsText(event.venue)}`,
    `DESCRIPTION:${icsText((event.description || '').slice(0, 500))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}

/** Save the event as a calendar file. */
export function downloadIcs(event) {
  const blob = new Blob([buildIcs(event)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${event.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
