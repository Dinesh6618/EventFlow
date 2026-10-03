/**
 * Rule-based recommendations. Every rule reads real metrics (services/eventMetrics.js), explains
 * what it saw, and offers a SUGGESTION. Nothing here changes anything: the organizer decides.
 * Rules are plain functions so each one can be tested with hand-made metrics.
 */

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 90 -> "90 minutes", 300 -> "5 hours", 4000 -> "3 days". */
export function span(minutes) {
  const m = Math.abs(Math.round(minutes));
  if (m < 120) return plural(m, 'minute');
  if (m < 48 * 60) return plural(Math.round(m / 60), 'hour');
  return plural(Math.round(m / (24 * 60)), 'day');
}

const ev = (label, value) => ({ label, value: String(value) });
const eventLink = (m, tab) => `/organizer/events/${m.event.id}${tab ? `/${tab}` : ''}`;
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

const live = (m) => m.event.status === 'ongoing';
const over = (m) => m.event.status === 'ended';
const upcoming = (m) => m.event.status === 'upcoming';

/* ------------------------------------------------------------------ registration */

function registrationLow(m) {
  const { registration: r, timing: t } = m;
  if (!upcoming(m) || t.minutesToDeadline <= 0 || t.minutesToDeadline > 7 * 24 * 60 || r.fillRate >= 50) return null;
  return {
    key: 'registration-low-fill',
    category: 'registration',
    severity: t.minutesToDeadline <= 48 * 60 ? 'important' : 'suggestion',
    title: `Registrations are at ${r.fillRate}% of capacity`,
    message: `${r.registered} of ${m.event.capacity} seats are taken and registration closes in ${span(t.minutesToDeadline)}.`,
    suggestion: 'Send an announcement or share the event page to bring more people in, or extend the deadline if you still need more participants.',
    evidence: [ev('Registered', `${r.registered} of ${m.event.capacity}`), ev('New in the last 24 hours', r.last24h), ev('Registration closes in', span(t.minutesToDeadline))],
    link: eventLink(m, 'announcements'),
  };
}

function registrationBacklog(m) {
  const r = m.registration;
  if (!m.event.requiresApproval || r.pending === 0 || over(m)) return null;
  return {
    key: 'registration-pending-backlog',
    category: 'registration',
    severity: r.oldestPendingHours >= 48 || r.pending >= 10 ? 'important' : 'suggestion',
    title: `${plural(r.pending, 'registration')} waiting for approval`,
    message: `${r.pending === 1 ? '1 person is' : `${r.pending} people are`} waiting to hear whether they have a seat. The oldest has waited ${span(r.oldestPendingHours * 60)}.`,
    suggestion: 'Review the pending registrations so people can plan around the event.',
    evidence: [ev('Pending', r.pending), ev('Oldest waiting', span(r.oldestPendingHours * 60))],
    link: `/organizer/participants?eventId=${m.event.id}`,
  };
}

function registrationNearlyFull(m) {
  const r = m.registration;
  if (!upcoming(m) || r.fillRate < 90) return null;
  return {
    key: 'registration-nearly-full',
    category: 'registration',
    severity: 'info',
    title: r.fillRate >= 100 ? 'The event is full' : `Only ${m.event.capacity - r.registered} seats left`,
    message: `${r.registered} of ${m.event.capacity} seats are taken (${r.fillRate}%).`,
    suggestion: 'If the venue can hold more people, consider raising the capacity before demand turns people away.',
    evidence: [ev('Fill rate', `${r.fillRate}%`), ev('Cancelled so far', r.cancelled)],
    link: eventLink(m),
  };
}

function conversionLow(m) {
  const r = m.registration;
  if (!upcoming(m) || r.viewers < 10 || r.conversion >= 30) return null;
  return {
    key: 'registration-low-conversion',
    category: 'registration',
    severity: 'suggestion',
    title: `Only ${r.conversion}% of visitors register`,
    message: `${r.viewers} people have opened the event page but few registered.`,
    suggestion: 'Check that the description, date and deadline are clear, and consider adding a banner image.',
    evidence: [ev('People who viewed the event', r.viewers), ev('Registration conversion', `${r.conversion}%`)],
    link: eventLink(m),
  };
}

/* ------------------------------------------------------------------- attendance */

function checkInNotStarted(m) {
  const { attendance: a, registration: r, timing: t } = m;
  if (!live(m) || t.minutesSinceStart < 30 || r.attendable === 0 || a.attended > 0) return null;
  return {
    key: 'attendance-not-started',
    category: 'attendance',
    severity: 'important',
    title: 'Nobody has been checked in yet',
    message: `The event started ${span(t.minutesSinceStart)} ago and none of ${r.attendable} registered participants has been scanned in.`,
    suggestion: m.staff.volunteers === 0 ? 'Open the Check-in tab to scan QR codes yourself, and add volunteers on the Team tab.' : 'Ask your volunteers to open their Volunteering page and start scanning.',
    evidence: [ev('Registered', r.attendable), ev('Checked in', 0), ev('Volunteers', m.staff.volunteers)],
    link: eventLink(m, 'scan'),
  };
}

function attendanceLow(m) {
  const { attendance: a, registration: r, timing: t } = m;
  if (r.attendable < 5 || a.attended === 0 || a.rate >= 80) return null;
  const evidence = [ev('Attendance', `${a.rate}% (${a.attended} of ${r.attendable})`), ev('Not checked in', a.noShows)];

  if (live(m) && t.minutesSinceStart >= 60) {
    const next = m.sessions.next;
    const soon = next && next.minutesToStart <= 180;
    return {
      key: 'attendance-low-live',
      category: 'attendance',
      severity: 'suggestion',
      title: `Your event has ${a.rate}% attendance`,
      message: `${a.attended} of ${r.attendable} registered participants have checked in so far.`,
      suggestion: soon
        ? `Consider sending a reminder before "${next.title}", which starts in ${span(next.minutesToStart)}.`
        : 'Consider sending an announcement to registered participants who have not arrived yet.',
      evidence,
      link: eventLink(m, 'announcements'),
    };
  }
  if (over(m) && t.minutesSinceEnd < 14 * 24 * 60) {
    return {
      key: 'attendance-low-ended',
      category: 'attendance',
      severity: 'info',
      title: `Attendance was ${a.rate}%`,
      message: `${a.noShows} of ${r.attendable} approved participants never checked in.`,
      suggestion: 'For next time, send an announcement a day before and again a couple of hours before the start. Automatic reminders already go out 24 hours and 1 hour before.',
      evidence,
      link: eventLink(m, 'attendance'),
    };
  }
  return null;
}

/* ---------------------------------------------------------------------- sessions */

function sessionLowAttendance(m) {
  const attended = m.attendance.attended;
  const sessions = m.sessions.items.filter((s) => s.type !== 'break');
  if (attended < 10 || !sessions.some((s) => s.scans > 0)) return null; // session scanning is not in use
  const weak = sessions.filter((s) => s.status === 'past' && (s.scans / attended) * 100 < 40);
  if (weak.length === 0) return null;
  return {
    key: 'sessions-low-attendance',
    category: 'sessions',
    severity: 'suggestion',
    title: weak.length === 1 ? `"${weak[0].title}" drew a small crowd` : `${weak.length} sessions drew small crowds`,
    message: weak.slice(0, 3).map((s) => `"${s.title}" reached ${s.scans} of ${attended} checked-in participants (${Math.round((s.scans / attended) * 100)}%)`).join('; ') + '.',
    suggestion: 'Next time, consider a more prominent time slot, a reminder announcement just before it, or combining it with a stronger session.',
    evidence: weak.slice(0, 3).map((s) => ev(s.title, `${s.scans} scanned`)),
    link: eventLink(m, 'attendance'),
  };
}

function venueConflicts(m) {
  const items = m.sessions.items.filter((s) => s.venue.trim());
  const clashes = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const a = items[i];
      const b = items[j];
      if (a.date === b.date && a.venue.trim().toLowerCase() === b.venue.trim().toLowerCase() && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)) clashes.push([a, b]);
    }
  }
  if (clashes.length === 0 || over(m)) return null;
  const [a, b] = clashes[0];
  return {
    key: 'schedule-venue-conflict',
    category: 'schedule',
    severity: 'important',
    title: clashes.length === 1 ? 'Two sessions overlap in the same venue' : `${clashes.length} venue clashes in the schedule`,
    message: `"${a.title}" (${a.startTime}-${a.endTime}) and "${b.title}" (${b.startTime}-${b.endTime}) are both in ${a.venue} on ${a.date}.`,
    suggestion: 'Move one of them to another time or another venue so participants are not turned away.',
    evidence: clashes.slice(0, 3).map(([x, y]) => ev(x.venue, `${x.title} / ${y.title}`)),
    link: eventLink(m, 'schedule'),
  };
}

function longBlocks(m) {
  if (over(m)) return null;
  const byDay = new Map();
  for (const s of m.sessions.items) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const found = [];
  for (const [date, list] of byDay) {
    let blockStart = null;
    let blockEnd = null;
    let count = 0;
    const close = () => {
      if (blockStart !== null && count >= 2 && blockEnd - blockStart > 240) found.push({ date, hours: Math.round(((blockEnd - blockStart) / 60) * 10) / 10 });
      blockStart = null;
      count = 0;
    };
    for (const s of [...list].sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))) {
      const start = toMinutes(s.startTime);
      if (s.type === 'break') {
        close();
        continue;
      }
      if (blockStart !== null && start - blockEnd >= 20) close();
      if (blockStart === null) blockStart = start;
      blockEnd = Math.max(blockEnd ?? 0, toMinutes(s.endTime));
      count += 1;
    }
    close();
  }
  if (found.length === 0) return null;
  return {
    key: 'schedule-no-break',
    category: 'schedule',
    severity: 'suggestion',
    title: `${found[0].hours} hours without a break`,
    message: `${found.length === 1 ? 'There is a stretch' : `${found.length} days have stretches`} of back-to-back sessions longer than four hours (for example on ${found[0].date}).`,
    suggestion: 'Add a short break or a meal so people can recharge and stay for the later sessions.',
    evidence: found.slice(0, 3).map((f) => ev(f.date, `${f.hours} hours`)),
    link: eventLink(m, 'schedule'),
  };
}

function scheduleMissing(m) {
  if (!upcoming(m) || m.sessions.total > 0 || m.timing.minutesToStart > 14 * 24 * 60) return null;
  return {
    key: 'schedule-missing',
    category: 'schedule',
    severity: m.timing.minutesToStart <= 72 * 60 ? 'important' : 'suggestion',
    title: 'No schedule published yet',
    message: `The event starts in ${span(m.timing.minutesToStart)} and participants cannot see what is planned.`,
    suggestion: 'Add the sessions, talks and breaks.',
    evidence: [ev('Sessions', 0), ev('Starts in', span(m.timing.minutesToStart))],
    link: eventLink(m, 'schedule'),
  };
}

function sessionDetails(m) {
  if (over(m)) return null;
  const missing = m.sessions.items.filter((s) => s.status !== 'past' && ['talk', 'workshop'].includes(s.type) && (!s.speaker.trim() || !s.venue.trim()));
  if (missing.length === 0) return null;
  return {
    key: 'schedule-missing-details',
    category: 'schedule',
    severity: 'info',
    title: `${plural(missing.length, 'session')} missing a speaker or venue`,
    message: missing.slice(0, 3).map((s) => `"${s.title}"`).join(', ') + (missing.length > 3 ? ' and more' : '') + ' still need details.',
    suggestion: 'Fill them in so participants know where to go and who to expect.',
    evidence: missing.slice(0, 3).map((s) => ev(s.title, [!s.speaker.trim() && 'no speaker', !s.venue.trim() && 'no venue'].filter(Boolean).join(', '))),
    link: eventLink(m, 'schedule'),
  };
}

/* -------------------------------------------------------------------- volunteers */

function volunteersNone(m) {
  const near = live(m) || (upcoming(m) && m.timing.minutesToStart <= 7 * 24 * 60);
  if (!near || m.staff.volunteers > 0 || m.registration.attendable < 30) return null;
  return {
    key: 'volunteers-none',
    category: 'volunteers',
    severity: live(m) || m.timing.minutesToStart <= 48 * 60 ? 'important' : 'suggestion',
    title: 'No volunteers assigned for check-in',
    message: `${m.registration.attendable} participants are expected and nobody else can scan QR codes.`,
    suggestion: 'Add volunteers on the Team tab. They can check people in from their own phones.',
    evidence: [ev('Expected participants', m.registration.attendable), ev('Volunteers', 0)],
    link: eventLink(m, 'staff'),
  };
}

function volunteersLow(m) {
  const { volunteers } = m.staff;
  const n = m.registration.attendable;
  if (over(m) || volunteers === 0 || n < 50 || n / volunteers <= 40) return null;
  return {
    key: 'volunteers-low-ratio',
    category: 'volunteers',
    severity: 'suggestion',
    title: `${plural(volunteers, 'volunteer')} for ${n} participants`,
    message: `That is about one volunteer for every ${Math.round(n / volunteers)} people. Events like this usually want one for every 25 or so.`,
    suggestion: `Consider adding ${Math.max(Math.ceil(n / 25) - volunteers, 1)} more volunteers, especially for check-in.`,
    evidence: [ev('Volunteers', volunteers), ev('Participants', n)],
    link: eventLink(m, 'staff'),
  };
}

/* ------------------------------------------------------------------------- teams */

function judgesMissing(m) {
  if (!m.event.teamEnabled || over(m) || m.judging.criteria === 0 || m.staff.judges > 0 || m.teams.count === 0) return null;
  return {
    key: 'judging-no-judges',
    category: 'teams',
    severity: 'suggestion',
    title: 'Scoring criteria are set but there are no judges',
    message: `${plural(m.teams.count, 'team')} will need to be scored.`,
    suggestion: 'Add judges on the Team tab, then assign teams to them on the Judging tab.',
    evidence: [ev('Teams', m.teams.count), ev('Criteria', m.judging.criteria), ev('Judges', 0)],
    link: eventLink(m, 'staff'),
  };
}

function teamsUnassigned(m) {
  const t = m.teams;
  if (!m.event.teamEnabled || over(m) || m.registration.registered < 8 || t.unassigned < 5 || t.unassignedShare < 25) return null;
  return {
    key: 'teams-unassigned',
    category: 'teams',
    severity: 'suggestion',
    title: `${plural(t.unassigned, 'participant')} (${t.unassignedShare}%) have no team`,
    message: 'Participants without a team may miss the competition.',
    suggestion: 'Announce a team-formation window. Participants can find teammates by skill from the event page, and you can see who is still unassigned on the Teams tab.',
    evidence: [ev('Without a team', t.unassigned), ev('Registered', m.registration.registered), ev('Teams so far', t.count)],
    link: eventLink(m, 'teams'),
  };
}

function teamsIncomplete(m) {
  const soon = live(m) || (upcoming(m) && m.timing.minutesToStart <= 3 * 24 * 60);
  if (!m.event.teamEnabled || !soon || m.teams.belowMin === 0) return null;
  return {
    key: 'teams-below-minimum',
    category: 'teams',
    severity: 'suggestion',
    title: `${plural(m.teams.belowMin, 'team')} below the minimum size`,
    message: `Teams need at least ${m.event.minTeamSize} members to compete.`,
    suggestion: 'Ask those teams to invite more people, or help them merge. The Teams tab lists participants still without a team.',
    evidence: [ev('Teams below minimum', m.teams.belowMin), ev('Minimum size', m.event.minTeamSize)],
    link: eventLink(m, 'teams'),
  };
}

function projectsUnsubmitted(m) {
  const j = m.judging;
  if (!m.event.teamEnabled || m.teams.count === 0 || m.teams.unsubmitted === 0) return null;
  const judgingOpen = j.assigned === 0 || j.submitted < j.assigned;
  if (!(live(m) || (over(m) && judgingOpen && m.timing.minutesSinceEnd < 7 * 24 * 60))) return null;
  return {
    key: 'teams-unsubmitted',
    category: 'teams',
    severity: 'suggestion',
    title: `${m.teams.unsubmitted} of ${plural(m.teams.count, 'team')} have not submitted a project`,
    message: 'Judges can only review projects that teams have submitted.',
    suggestion: 'Send an announcement reminding team leaders to submit their project.',
    evidence: [ev('Not submitted', m.teams.unsubmitted), ev('Teams', m.teams.count)],
    link: eventLink(m, 'announcements'),
  };
}

function judgingBehind(m) {
  const j = m.judging;
  if (!over(m) || j.assigned === 0 || j.submitted >= j.assigned) return null;
  return {
    key: 'judging-behind',
    category: 'teams',
    severity: m.timing.minutesSinceEnd > 24 * 60 ? 'important' : 'suggestion',
    title: `${j.assigned - j.submitted} of ${j.assigned} evaluations are still pending`,
    message: `The event ended ${span(m.timing.minutesSinceEnd)} ago and results cannot be final yet.`,
    suggestion: 'Check the Judging tab to see which judges are behind, and nudge them.',
    evidence: [ev('Submitted', `${j.submitted} of ${j.assigned}`)],
    link: eventLink(m, 'judging'),
  };
}

function leaderboardReady(m) {
  const j = m.judging;
  if (!over(m) || j.assigned === 0 || j.submitted < j.assigned || m.event.leaderboardPublished) return null;
  return {
    key: 'judging-ready-to-publish',
    category: 'teams',
    severity: 'info',
    title: 'All evaluations are in',
    message: 'Every assigned judge has submitted their scores.',
    suggestion: 'Review the leaderboard and publish it when you are happy. Then you can issue winner certificates.',
    evidence: [ev('Evaluations', `${j.submitted} of ${j.assigned}`)],
    link: eventLink(m, 'judging'),
  };
}

/* ---------------------------------------------------------------------- feedback */

function feedbackResponses(m) {
  const f = m.feedback;
  const t = m.timing;
  if (!over(m) || t.minutesSinceEnd < 24 * 60 || t.minutesSinceEnd > 21 * 24 * 60 || m.registration.attendable < 10 || f.rate >= 30) return null;
  return {
    key: 'feedback-low-response',
    category: 'feedback',
    severity: 'suggestion',
    title: `Only ${f.rate}% have given feedback`,
    message: `${f.responses} of ${m.registration.attendable} participants have rated the event, so the results may not be representative.`,
    suggestion: 'Send an announcement asking attendees for two minutes of feedback.',
    evidence: [ev('Responses', f.responses), ev('Response rate', `${f.rate}%`)],
    link: eventLink(m, 'announcements'),
  };
}

function feedbackRating(m) {
  const f = m.feedback;
  if (f.responses < 5 || f.overall === null || f.overall >= 3.5) return null;
  const dims = [['organization', f.organization], ['venue', f.venue], ['speakers', f.speaker]].filter(([, v]) => v !== null);
  const weakest = dims.sort((a, b) => a[1] - b[1])[0];
  return {
    key: 'feedback-low-rating',
    category: 'feedback',
    severity: f.overall < 3 ? 'important' : 'suggestion',
    title: `Average rating is ${f.overall} out of 5`,
    message: weakest ? `${weakest[0][0].toUpperCase()}${weakest[0].slice(1)} scored lowest (${weakest[1]}).` : 'Participants rated the event below average.',
    suggestion: `Read the comments and suggestions on the Feedback tab${weakest ? `, starting with ${weakest[0]}` : ''}, and note what to change next time.`,
    evidence: [ev('Average overall', f.overall), ev('Responses', f.responses), ...dims.map(([n, v]) => ev(n, v))],
    link: eventLink(m, 'feedback'),
  };
}

function feedbackSessions(m) {
  const low = m.feedback.lowSessions;
  if (low.length === 0) return null;
  return {
    key: 'feedback-low-sessions',
    category: 'feedback',
    severity: 'suggestion',
    title: low.length === 1 ? `"${low[0].title}" was rated poorly` : `${low.length} sessions were rated poorly`,
    message: low.slice(0, 3).map((s) => `"${s.title}": ${s.avg} out of 5 from ${s.n} people`).join('; ') + '.',
    suggestion: 'Look at the session feedback for what went wrong before running it again.',
    evidence: low.slice(0, 3).map((s) => ev(s.title, `${s.avg} / 5`)),
    link: eventLink(m, 'feedback'),
  };
}

function certificatesPending(m) {
  if (!over(m) || m.timing.minutesSinceEnd < 60 || m.attendance.attended === 0 || m.certificates.participant > 0) return null;
  return {
    key: 'certificates-pending',
    category: 'general',
    severity: 'info',
    title: 'Certificates have not been issued',
    message: `${m.attendance.attended} people attended and none has a certificate yet.`,
    suggestion: 'Issue participation certificates from the Certificates tab. Recipients are notified and can download them straight away.',
    evidence: [ev('Attended', m.attendance.attended)],
    link: eventLink(m, 'certificates'),
  };
}

const RULES = [
  registrationLow, registrationBacklog, registrationNearlyFull, conversionLow,
  checkInNotStarted, attendanceLow,
  sessionLowAttendance, venueConflicts, longBlocks, scheduleMissing, sessionDetails,
  volunteersNone, volunteersLow,
  judgesMissing, teamsUnassigned, teamsIncomplete, projectsUnsubmitted, judgingBehind, leaderboardReady,
  feedbackResponses, feedbackRating, feedbackSessions, certificatesPending,
];

const ORDER = { important: 0, suggestion: 1, info: 2 };

/** All recommendations that apply to these metrics, most important first. */
export function evaluateRules(metrics) {
  return RULES.map((rule) => rule(metrics))
    .filter(Boolean)
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
