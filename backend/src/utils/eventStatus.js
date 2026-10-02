const pad = (n) => String(n).padStart(2, '0');

// Events store plain local dates/times (no timezone), so compare them as local
// "YYYY-MM-DDTHH:mm" strings, which sort chronologically.
export function localNow(now = new Date()) {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return { date, time, dateTime: `${date}T${time}` };
}

/** 'upcoming' | 'ongoing' | 'ended' */
export function getEventStatus(event, now = localNow()) {
  if (now.dateTime < `${event.date}T${event.startTime}`) return 'upcoming';
  if (now.dateTime < `${event.endDate || event.date}T${event.endTime}`) return 'ongoing';
  return 'ended';
}

/** Registration is open until the deadline passes or the event ends. */
export function isRegistrationOpen(event, now = localNow()) {
  return getEventStatus(event, now) !== 'ended' && now.dateTime <= event.registrationDeadline;
}

/** True while `now` falls on one of the event's calendar days (multi-day events use `endDate`). */
export function isEventDay(event, now = localNow()) {
  return now.date >= event.date && now.date <= (event.endDate || event.date);
}
