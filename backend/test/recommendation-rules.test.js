import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateRules, span } from '../src/services/recommendationRules.js';

// Phase 10: the rule engine, tested on hand-made metrics so every threshold is exercised exactly.
const base = () => ({
  now: { date: '2026-10-10', time: '12:00', dateTime: '2026-10-10T12:00' },
  event: { id: 7, name: 'Test Fest', status: 'upcoming', capacity: 100, requiresApproval: false, teamEnabled: false, minTeamSize: 2, leaderboardPublished: false },
  timing: { minutesToStart: 20 * 24 * 60, minutesSinceStart: -20 * 24 * 60, minutesSinceEnd: -21 * 24 * 60, minutesToDeadline: 15 * 24 * 60 },
  registration: { registered: 80, pending: 0, cancelled: 0, rejected: 0, attendable: 80, fillRate: 80, last24h: 5, oldestPendingHours: 0, viewers: 0, conversion: 0 },
  attendance: { attended: 0, inside: 0, checkedOut: 0, rate: 0, noShows: 80, last10min: 0, lastActivity: null },
  sessions: { total: 0, items: [], today: 0, current: [], next: null },
  staff: { volunteers: 5, judges: 0 },
  teams: { count: 0, belowMin: 0, unsubmitted: 0, unassigned: 0, unassignedShare: 0 },
  judging: { criteria: 0, assigned: 0, submitted: 0 },
  feedback: { responses: 0, rate: 0, overall: null, organization: null, venue: null, speaker: null, lowSessions: [] },
  certificates: { participant: 0 },
  announcements: { last24h: 0, latest: null },
});

const merge = (target, patch) => {
  for (const [key, value] of Object.entries(patch)) {
    target[key] = value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key]) ? merge({ ...target[key] }, value) : value;
  }
  return target;
};
const metrics = (patch = {}) => merge(base(), patch);
const find = (m, key) => evaluateRules(m).find((f) => f.key === key);
const session = (o = {}) => ({ id: 1, title: 'Talk', type: 'talk', venue: 'Hall A', speaker: 'Dr. X', date: '2026-10-10', startTime: '10:00', endTime: '11:00', status: 'upcoming', minutesToStart: 60, scans: 0, ...o });

describe('a healthy event', () => {
  it('has nothing to recommend', () => {
    assert.deepEqual(evaluateRules(metrics()), []);
  });

  it('formats time spans in plain words', () => {
    assert.equal(span(45), '45 minutes');
    assert.equal(span(1), '1 minute');
    assert.equal(span(300), '5 hours');
    assert.equal(span(60 * 24 * 4), '4 days');
    assert.equal(span(-90), '90 minutes');
  });
});

describe('registration', () => {
  it('flags low fill only when the deadline is close', () => {
    const low = { registration: { registered: 20, fillRate: 20 } };
    assert.equal(find(metrics({ ...low, timing: { minutesToDeadline: 10 * 24 * 60 } }), 'registration-low-fill'), undefined, 'deadline is far away');
    assert.equal(find(metrics({ registration: { registered: 60, fillRate: 60 }, timing: { minutesToDeadline: 3 * 24 * 60 } }), 'registration-low-fill'), undefined, 'enough people');
    const soon = find(metrics({ ...low, timing: { minutesToDeadline: 5 * 24 * 60 } }), 'registration-low-fill');
    assert.equal(soon.severity, 'suggestion');
    assert.match(soon.title, /20% of capacity/);
    assert.match(soon.message, /20 of 100 seats.*5 days/);
    const urgent = find(metrics({ ...low, timing: { minutesToDeadline: 30 * 60 } }), 'registration-low-fill');
    assert.equal(urgent.severity, 'important');
    assert.equal(find(metrics({ ...low, timing: { minutesToDeadline: -10 } }), 'registration-low-fill'), undefined, 'registration already closed');
  });

  it('flags a backlog of pending registrations, more urgently when it is old or large', () => {
    const m = (pending, hours, approval = true) => metrics({ event: { requiresApproval: approval }, registration: { pending, oldestPendingHours: hours } });
    assert.equal(find(m(0, 0), 'registration-pending-backlog'), undefined);
    assert.equal(find(m(3, 5, false), 'registration-pending-backlog'), undefined, 'approval not required for this event');
    assert.equal(find(m(3, 5), 'registration-pending-backlog').severity, 'suggestion');
    assert.equal(find(m(3, 60), 'registration-pending-backlog').severity, 'important');
    assert.equal(find(m(12, 1), 'registration-pending-backlog').severity, 'important');
    assert.match(find(m(1, 5), 'registration-pending-backlog').message, /^1 person is waiting/);
    assert.match(find(m(4, 5), 'registration-pending-backlog').message, /^4 people are waiting/);
  });

  it('notes an almost full event, and low conversion with enough visitors', () => {
    assert.equal(find(metrics({ registration: { registered: 90, fillRate: 90 } }), 'registration-nearly-full').title, 'Only 10 seats left');
    assert.equal(find(metrics({ registration: { registered: 100, fillRate: 100 } }), 'registration-nearly-full').title, 'The event is full');
    assert.equal(find(metrics({ registration: { fillRate: 89 } }), 'registration-nearly-full'), undefined);
    assert.equal(find(metrics({ registration: { viewers: 9, conversion: 10 } }), 'registration-low-conversion'), undefined, 'too few visitors to judge');
    assert.match(find(metrics({ registration: { viewers: 40, conversion: 12 } }), 'registration-low-conversion').title, /12%/);
    assert.equal(find(metrics({ registration: { viewers: 40, conversion: 30 } }), 'registration-low-conversion'), undefined);
  });
});

describe('attendance', () => {
  const live = (patch) => metrics({ event: { status: 'ongoing' }, timing: { minutesSinceStart: 90, minutesToStart: -90 }, registration: { attendable: 100, registered: 100 }, ...patch });

  it('warns when nobody has been checked in 30 minutes after the start', () => {
    assert.equal(find(live({ attendance: { attended: 0 }, timing: { minutesSinceStart: 20 } }), 'attendance-not-started'), undefined, 'still early');
    const f = find(live({ attendance: { attended: 0 }, staff: { volunteers: 0 } }), 'attendance-not-started');
    assert.equal(f.severity, 'important');
    assert.match(f.suggestion, /add volunteers/);
    assert.match(find(live({ attendance: { attended: 0 } }), 'attendance-not-started').suggestion, /volunteers to open/);
    assert.equal(find(live({ attendance: { attended: 3, rate: 3 } }), 'attendance-not-started'), undefined);
  });

  it('turns 72% attendance into a reminder before the next session', () => {
    const next = session({ title: 'AI Workshop', minutesToStart: 45 });
    const f = find(live({ attendance: { attended: 72, rate: 72, noShows: 28 }, sessions: { next } }), 'attendance-low-live');
    assert.equal(f.title, 'Your event has 72% attendance');
    assert.equal(f.severity, 'suggestion');
    assert.match(f.suggestion, /reminder before "AI Workshop", which starts in 45 minutes/);
    assert.deepEqual(f.evidence.map((e) => e.label), ['Attendance', 'Not checked in']);
    assert.match(f.evidence[0].value, /72% \(72 of 100\)/);
  });

  it('falls back to a general reminder when no session is close, and stays quiet at 80% or above', () => {
    const f = find(live({ attendance: { attended: 60, rate: 60 }, sessions: { next: session({ minutesToStart: 600 }) } }), 'attendance-low-live');
    assert.match(f.suggestion, /announcement to registered participants who have not arrived/);
    assert.equal(find(live({ attendance: { attended: 80, rate: 80 } }), 'attendance-low-live'), undefined);
    assert.equal(find(live({ attendance: { attended: 40, rate: 40 }, timing: { minutesSinceStart: 30 } }), 'attendance-low-live'), undefined, 'too early to judge');
  });

  it('looks back on low attendance after the event', () => {
    const ended = metrics({ event: { status: 'ended' }, timing: { minutesSinceEnd: 600 }, registration: { attendable: 100 }, attendance: { attended: 60, rate: 60, noShows: 40 } });
    const f = find(ended, 'attendance-low-ended');
    assert.equal(f.severity, 'info');
    assert.match(f.message, /40 of 100/);
    assert.equal(find({ ...ended, timing: { ...ended.timing, minutesSinceEnd: 20 * 24 * 60 } }, 'attendance-low-ended'), undefined, 'old news');
  });
});

describe('sessions and schedule', () => {
  it('finds sessions that drew small crowds, but only when session scanning is in use', () => {
    const ended = (items) => metrics({ event: { status: 'ended' }, attendance: { attended: 100 }, sessions: { items } });
    const items = [session({ id: 1, title: 'Keynote', status: 'past', scans: 90 }), session({ id: 2, title: 'Niche Talk', status: 'past', scans: 20 })];
    const f = find(ended(items), 'sessions-low-attendance');
    assert.match(f.title, /"Niche Talk" drew a small crowd/);
    assert.match(f.message, /20 of 100.*20%/);
    assert.equal(find(ended(items.map((s) => ({ ...s, scans: 0 }))), 'sessions-low-attendance'), undefined, 'nobody scans sessions here');
    assert.equal(find(metrics({ event: { status: 'ended' }, attendance: { attended: 5 }, sessions: { items } }), 'sessions-low-attendance'), undefined, 'too few attendees');
  });

  it('spots two sessions overlapping in the same venue', () => {
    const items = [session({ id: 1, title: 'A', startTime: '10:00', endTime: '11:00' }), session({ id: 2, title: 'B', startTime: '10:30', endTime: '11:30', venue: 'hall a' })];
    const f = find(metrics({ sessions: { items } }), 'schedule-venue-conflict');
    assert.equal(f.severity, 'important');
    assert.match(f.message, /"A" \(10:00-11:00\) and "B" \(10:30-11:30\) are both in Hall A/);
    assert.equal(find(metrics({ sessions: { items: [items[0], { ...items[1], venue: 'Hall B' }] } }), 'schedule-venue-conflict'), undefined);
    assert.equal(find(metrics({ sessions: { items: [items[0], { ...items[1], startTime: '11:00', endTime: '12:00' }] } }), 'schedule-venue-conflict'), undefined, 'back-to-back is fine');
    assert.equal(find(metrics({ sessions: { items: [items[0], { ...items[1], date: '2026-10-11' }] } }), 'schedule-venue-conflict'), undefined, 'different day');
  });

  it('suggests a break after more than four hours of back-to-back sessions', () => {
    const run = (extra = []) => metrics({ sessions: { items: [session({ id: 1, startTime: '09:00', endTime: '11:00' }), session({ id: 2, startTime: '11:00', endTime: '13:00' }), session({ id: 3, startTime: '13:00', endTime: '14:00' }), ...extra] } });
    const f = find(run(), 'schedule-no-break');
    assert.match(f.title, /5 hours without a break/);
    assert.equal(find(metrics({ sessions: { items: [session({ id: 1, startTime: '09:00', endTime: '11:00' }), session({ id: 2, startTime: '11:00', endTime: '12:00' })] } }), 'schedule-no-break'), undefined, 'only three hours');
    const withBreak = metrics({ sessions: { items: [session({ id: 1, startTime: '09:00', endTime: '11:00' }), session({ id: 2, type: 'break', startTime: '11:00', endTime: '11:30' }), session({ id: 3, startTime: '11:30', endTime: '14:00' })] } });
    assert.equal(find(withBreak, 'schedule-no-break'), undefined, 'a break splits the stretch');
  });

  it('asks for a schedule when none exists and the event is near, and for missing speaker/venue details', () => {
    assert.equal(find(metrics({ timing: { minutesToStart: 5 * 24 * 60 } }), 'schedule-missing').severity, 'suggestion');
    assert.equal(find(metrics({ timing: { minutesToStart: 2 * 24 * 60 } }), 'schedule-missing').severity, 'important');
    assert.equal(find(metrics({ timing: { minutesToStart: 30 * 24 * 60 } }), 'schedule-missing'), undefined, 'plenty of time');
    const f = find(metrics({ sessions: { total: 2, items: [session({ speaker: '' }), session({ id: 2, type: 'session', venue: '' })] } }), 'schedule-missing-details');
    assert.match(f.title, /1 session missing a speaker or venue/);
  });
});

describe('volunteers', () => {
  it('requires volunteers for a sizeable, near event', () => {
    const near = { staff: { volunteers: 0 }, registration: { attendable: 60 }, timing: { minutesToStart: 3 * 24 * 60 } };
    const f = find(metrics(near), 'volunteers-none');
    assert.equal(f.severity, 'suggestion');
    assert.equal(find(metrics({ ...near, timing: { minutesToStart: 24 * 60 } }), 'volunteers-none').severity, 'important');
    assert.equal(find(metrics({ ...near, registration: { attendable: 20 } }), 'volunteers-none'), undefined, 'small event');
    assert.equal(find(metrics({ ...near, timing: { minutesToStart: 30 * 24 * 60 } }), 'volunteers-none'), undefined, 'far away');
  });

  it('compares the number of volunteers with the crowd', () => {
    const f = find(metrics({ staff: { volunteers: 2 }, registration: { attendable: 100 } }), 'volunteers-low-ratio');
    assert.match(f.message, /one volunteer for every 50 people/);
    assert.match(f.suggestion, /adding 2 more volunteers/);
    assert.equal(find(metrics({ staff: { volunteers: 4 }, registration: { attendable: 100 } }), 'volunteers-low-ratio'), undefined, '1 per 25 is fine');
    assert.equal(find(metrics({ staff: { volunteers: 1 }, registration: { attendable: 40 } }), 'volunteers-low-ratio'), undefined);
  });
});

describe('teams and judging', () => {
  const team = (patch = {}) => merge(metrics({ event: { teamEnabled: true }, registration: { registered: 40 } }), patch);

  it('notices participants without a team and teams below the minimum', () => {
    const f = find(team({ teams: { count: 6, unassigned: 16, unassignedShare: 40 } }), 'teams-unassigned');
    assert.match(f.title, /16 participants \(40%\) have no team/);
    assert.equal(find(team({ teams: { count: 6, unassigned: 3, unassignedShare: 40 } }), 'teams-unassigned'), undefined, 'too few to matter');
    assert.equal(find(metrics({ teams: { unassigned: 30, unassignedShare: 60 } }), 'teams-unassigned'), undefined, 'teams are off for this event');
    assert.match(find(team({ timing: { minutesToStart: 24 * 60 }, teams: { count: 5, belowMin: 2 } }), 'teams-below-minimum').title, /2 teams below the minimum size/);
    assert.equal(find(team({ teams: { count: 5, belowMin: 2 } }), 'teams-below-minimum'), undefined, 'event is weeks away');
  });

  it('tracks unsubmitted projects, pending evaluations and a board ready to publish', () => {
    const live = { event: { status: 'ongoing' }, teams: { count: 4, unsubmitted: 3 } };
    assert.match(find(team(live), 'teams-unsubmitted').title, /3 of 4 teams have not submitted/);
    const ended = (judging, minutes = 600, published = false) => team({ event: { status: 'ended', leaderboardPublished: published }, timing: { minutesSinceEnd: minutes }, judging });
    const behind = find(ended({ assigned: 8, submitted: 5 }), 'judging-behind');
    assert.equal(behind.severity, 'suggestion');
    assert.match(behind.title, /3 of 8 evaluations are still pending/);
    assert.equal(find(ended({ assigned: 8, submitted: 5 }, 30 * 60), 'judging-behind').severity, 'important');
    assert.equal(find(ended({ assigned: 8, submitted: 8 }), 'judging-behind'), undefined);
    assert.equal(find(ended({ assigned: 8, submitted: 8 }), 'judging-ready-to-publish').severity, 'info');
    assert.equal(find(ended({ assigned: 8, submitted: 8 }, 600, true), 'judging-ready-to-publish'), undefined, 'already published');
    assert.match(find(team({ judging: { criteria: 4 }, teams: { count: 3 } }), 'judging-no-judges').title, /no judges/);
  });
});

describe('feedback and wrap-up', () => {
  const ended = (patch) => metrics({ event: { status: 'ended' }, timing: { minutesSinceEnd: 48 * 60 }, registration: { attendable: 50 }, attendance: { attended: 40 }, ...patch });

  it('asks for more responses once the dust has settled', () => {
    assert.match(find(ended({ feedback: { responses: 5, rate: 10 } }), 'feedback-low-response').title, /Only 10% have given feedback/);
    assert.equal(find(ended({ feedback: { responses: 20, rate: 40 } }), 'feedback-low-response'), undefined);
    assert.equal(find(ended({ timing: { minutesSinceEnd: 120 }, feedback: { rate: 10 } }), 'feedback-low-response'), undefined, 'too soon');
  });

  it('reads a low average and points at the weakest area', () => {
    const f = find(ended({ feedback: { responses: 12, overall: 3.2, organization: 3.8, venue: 2.4, speaker: 3.5, rate: 80 } }), 'feedback-low-rating');
    assert.equal(f.severity, 'suggestion');
    assert.match(f.message, /Venue scored lowest \(2\.4\)/);
    assert.equal(find(ended({ feedback: { responses: 12, overall: 2.8, venue: 2.4, rate: 80 } }), 'feedback-low-rating').severity, 'important');
    assert.equal(find(ended({ feedback: { responses: 4, overall: 2, rate: 80 } }), 'feedback-low-rating'), undefined, 'too few responses');
    assert.equal(find(ended({ feedback: { responses: 12, overall: 4.2, rate: 80 } }), 'feedback-low-rating'), undefined);
    assert.match(find(ended({ feedback: { lowSessions: [{ title: 'Panel', avg: 2.4, n: 6 }], rate: 80 } }), 'feedback-low-sessions').message, /"Panel": 2\.4 out of 5 from 6 people/);
  });

  it('reminds the organizer to issue certificates', () => {
    assert.equal(find(ended({}), 'certificates-pending').severity, 'info');
    assert.equal(find(ended({ certificates: { participant: 3 } }), 'certificates-pending'), undefined);
    assert.equal(find(ended({ attendance: { attended: 0 } }), 'certificates-pending'), undefined, 'nobody attended');
  });
});

describe('ordering', () => {
  it('lists the most important recommendations first and gives every one a unique key and link', () => {
    const m = metrics({
      event: { requiresApproval: true },
      timing: { minutesToDeadline: 30 * 60 },
      registration: { registered: 10, fillRate: 10, pending: 3, oldestPendingHours: 5 },
      sessions: { items: [session({ startTime: '10:00', endTime: '11:00' }), session({ id: 2, startTime: '10:30', endTime: '11:30' })] },
    });
    const all = evaluateRules(m);
    assert.ok(all.length >= 3);
    const ranks = all.map((f) => ({ important: 0, suggestion: 1, info: 2 })[f.severity]);
    assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
    assert.equal(new Set(all.map((f) => f.key)).size, all.length);
    for (const f of all) {
      assert.ok(f.title && f.message && f.suggestion, `${f.key} explains itself`);
      assert.ok(f.link.startsWith('/organizer/'), `${f.key} links somewhere useful`);
      assert.ok(Array.isArray(f.evidence) && f.evidence.length > 0, `${f.key} shows its evidence`);
    }
  });
});
