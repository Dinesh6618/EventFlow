import { query } from '../db.js';
import * as zones from '../models/zoneModel.js';
import { collectMetrics } from './eventMetrics.js';
import { evaluateRules } from './recommendationRules.js';

const STALE_AFTER_MINUTES = 60;

function phaseOf(m) {
  if (m.event.status === 'ongoing') return { key: 'live', label: 'Live now' };
  if (m.event.status === 'ended') return { key: 'ended', label: 'Event ended' };
  return m.timing.minutesToDeadline > 0 ? { key: 'registration', label: 'Registration open' } : { key: 'upcoming', label: 'Registration closed' };
}

/**
 * The live "digital twin" of an event: a snapshot assembled only from records the platform already
 * holds. Crowd zones are reported by people on the ground, so they carry who/when and go "stale"
 * instead of pretending to be live. Nothing here is estimated or simulated.
 */
export async function controlCenter(event, now = new Date()) {
  const m = await collectMetrics(event, now);
  const [zoneRows, recent] = await Promise.all([
    zones.list(event.id),
    query(
      `SELECT u.name, a.status, GREATEST(a.check_in_time, COALESCE(a.check_out_time, a.check_in_time)) AS "at"
         FROM attendance a JOIN users u ON u.id = a.user_id
        WHERE a.event_id = $1 ORDER BY "at" DESC LIMIT 8`,
      [event.id],
    ),
  ]);

  return {
    generatedAt: now.toISOString(),
    event: { id: event.id, name: event.name, venue: event.venue, date: event.date, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime },
    phase: phaseOf(m),
    participants: {
      registered: m.registration.registered,
      capacity: m.event.capacity,
      pending: m.registration.pending,
      checkedIn: m.attendance.attended,
      expected: m.registration.attendable,
      inside: m.attendance.inside,
      attendanceRate: m.attendance.rate,
    },
    teams: { active: m.teams.count, belowMinimum: m.teams.belowMin, projectsSubmitted: m.teams.count - m.teams.unsubmitted, withoutTeam: m.event.teamEnabled ? m.teams.unassigned : null, enabled: m.event.teamEnabled },
    sessions: {
      today: m.sessions.today,
      total: m.sessions.total,
      current: m.sessions.current.map((s) => ({ id: s.id, title: s.title, venue: s.venue, startTime: s.startTime, endTime: s.endTime, scanned: s.scans })),
      next: m.sessions.next ? { id: m.sessions.next.id, title: m.sessions.next.title, venue: m.sessions.next.venue, startTime: m.sessions.next.startTime, date: m.sessions.next.date, startsInMinutes: m.sessions.next.minutesToStart } : null,
    },
    operations: {
      checkInsLast10Minutes: m.attendance.last10min,
      lastCheckInAt: m.attendance.lastActivity,
      volunteers: m.staff.volunteers,
      zones: zoneRows.map((z) => {
        const ageMinutes = z.reportedAt ? Math.max(Math.round((now - new Date(z.reportedAt)) / 60000), 0) : null;
        return { ...z, ageMinutes, reported: Boolean(z.reportedAt), stale: ageMinutes !== null && ageMinutes > STALE_AFTER_MINUTES };
      }),
    },
    judging: { enabled: m.judging.criteria > 0 || m.staff.judges > 0, evaluationsSubmitted: m.judging.submitted, evaluationsAssigned: m.judging.assigned, judges: m.staff.judges, leaderboardPublished: m.event.leaderboardPublished },
    feedback: { responses: m.feedback.responses, average: m.feedback.overall },
    communication: { announcementsLast24h: m.announcements.last24h, lastAnnouncementAt: m.announcements.latest },
    activity: recent.map((r) => ({ name: r.name, action: r.status === 'checked_out' ? 'checked out' : 'checked in', at: r.at })),
    // Only the ones that need action now; the full list lives on the Insights tab.
    alerts: evaluateRules(m)
      .filter((f) => f.severity === 'important')
      .slice(0, 4)
      .map(({ key, title, message, link }) => ({ key, title, message, link })),
    staleAfterMinutes: STALE_AFTER_MINUTES,
  };
}
