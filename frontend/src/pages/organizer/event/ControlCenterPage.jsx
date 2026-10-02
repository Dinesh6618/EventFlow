import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { insightsApi } from '../../../api';
import { ZonePanel } from '../../../components/insights/ZonePanel.jsx';
import Alert from '../../../components/ui/Alert.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { formatDate, formatTime } from '../../../utils/format.js';
import { useEvent } from './EventManageLayout.jsx';

const PHASE_TONE = { live: 'green', ended: 'slate', registration: 'indigo', upcoming: 'amber' };

function Section({ title, hint, children, className = '' }) {
  return (
    <Card className={`p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </Card>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

const startsIn = (minutes) => {
  if (minutes < 1) return 'starting now';
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) return `in ${Math.round(minutes / 60)} h`;
  return `in ${Math.round(minutes / (24 * 60))} days`;
};

const clock = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function useSecondsSince(timestamp) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(Math.round((now - timestamp) / 1000), 0);
}

function UpdatedAt({ at, onRefresh }) {
  const seconds = useSecondsSince(new Date(at).getTime());
  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5" aria-live="off">
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
        Updated {seconds < 5 ? 'just now' : `${seconds}s ago`}, refreshes every 10 seconds
      </span>
      <Button size="sm" variant="secondary" onClick={onRefresh}>Refresh now</Button>
    </div>
  );
}

/**
 * The digital twin of the event: one live picture assembled from the platform's own records.
 * No figure here is estimated; crowd levels are reports from people on site and say when and by whom.
 */
export default function ControlCenterPage() {
  const { event } = useEvent();
  const { data: c, error, loading, reload } = useApi((signal) => insightsApi.controlCenter(event.id, signal), [event.id], { refreshMs: 10000 });

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!c && loading) return <PageLoader label="Loading the control center..." />;

  const { participants: p, teams, sessions, operations: ops, judging, feedback, communication } = c;
  const showAttendance = c.phase.key === 'live' || c.phase.key === 'ended' || p.checkedIn > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Control center</h2>
          <Badge tone={PHASE_TONE[c.phase.key]}>{c.phase.label}</Badge>
        </div>
        <UpdatedAt at={c.generatedAt} onRefresh={reload} />
      </div>

      {c.alerts.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2">
          {c.alerts.map((a) => (
            <Alert
              key={a.key}
              type="error"
              action={<Link to={a.link} className="shrink-0 font-medium underline">Open</Link>}
            >
              <p className="font-medium">{a.title}</p>
              <p className="mt-0.5 text-red-700">{a.message}</p>
            </Alert>
          ))}
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={showAttendance ? 'Checked in' : 'Registered'}
          value={showAttendance ? `${p.checkedIn} of ${p.expected}` : `${p.registered} of ${p.capacity}`}
          icon="users"
          tone="indigo"
        />
        <StatCard label="Attendance" value={showAttendance && p.expected > 0 ? `${p.attendanceRate}%` : '-'} icon="chart" tone="green" />
        <StatCard label={teams.enabled ? 'Active teams' : 'Teams'} value={teams.enabled ? teams.active : 'Off'} icon="user" tone="sky" />
        <StatCard label="Sessions today" value={sessions.today} icon="calendar" tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Sessions" hint="From your schedule and the scans volunteers have recorded.">
          {sessions.total === 0 ? (
            <p className="text-sm text-slate-500">
              No schedule yet. <Link to={`/organizer/events/${event.id}/schedule`} className="font-medium text-indigo-600">Add sessions</Link>
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">On now</p>
                {sessions.current.length === 0 ? (
                  <p className="mt-1 text-sm text-slate-500">Nothing is running at the moment.</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {sessions.current.map((s) => (
                      <li key={s.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm" data-testid="current-session">
                        <p className="font-medium text-emerald-900">{s.title}</p>
                        <p className="text-xs text-emerald-800">
                          {formatTime(s.startTime)} - {formatTime(s.endTime)}{s.venue ? ` at ${s.venue}` : ''} - {s.scanned} scanned in
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Up next</p>
                {sessions.next ? (
                  <div className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm" data-testid="next-session">
                    <p className="font-medium text-slate-900">{sessions.next.title}</p>
                    <p className="text-xs text-slate-600">
                      {formatDate(sessions.next.date)}, {formatTime(sessions.next.startTime)}{sessions.next.venue ? ` at ${sessions.next.venue}` : ''} ({startsIn(sessions.next.startsInMinutes)})
                    </p>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">No more sessions scheduled.</p>
                )}
              </div>
            </div>
          )}
        </Section>

        <Section title="Check-in desk" hint="Based on QR scans in the last 10 minutes.">
          <dl className="divide-y divide-slate-100">
            <Row label="Check-ins, last 10 minutes">{ops.checkInsLast10Minutes}</Row>
            <Row label="Currently inside">{p.inside}</Row>
            <Row label="Not yet arrived">{Math.max(p.expected - p.checkedIn, 0)}</Row>
            <Row label="Last check-in">{ops.lastCheckInAt ? clock(ops.lastCheckInAt) : 'None yet'}</Row>
            <Row label="Volunteers assigned">{ops.volunteers}</Row>
            {p.pending > 0 && (
              <Row label="Registrations awaiting approval">
                <Link to={`/organizer/events/${event.id}`} className="text-indigo-600">{p.pending}</Link>
              </Row>
            )}
          </dl>
        </Section>
      </div>

      <Section title="Crowd levels" hint={`Reported by you and your volunteers. Reports older than ${c.staleAfterMinutes} minutes are marked as possibly out of date. These are not sensor readings.`}>
        <ZonePanel eventId={event.id} zones={ops.zones} staleAfter={c.staleAfterMinutes} canManage onChanged={reload} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Judging">
          {judging.enabled ? (
            <dl className="divide-y divide-slate-100">
              <Row label="Judges">{judging.judges}</Row>
              <Row label="Evaluations">{judging.evaluationsSubmitted} of {judging.evaluationsAssigned}</Row>
              {teams.enabled && <Row label="Projects submitted">{teams.projectsSubmitted} of {teams.active}</Row>}
              <Row label="Leaderboard">{judging.leaderboardPublished ? 'Published' : 'Not published'}</Row>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Judging is not set up for this event.</p>
          )}
        </Section>
        <Section title="Feedback">
          {feedback.responses > 0 ? (
            <dl className="divide-y divide-slate-100">
              <Row label="Responses">{feedback.responses}</Row>
              <Row label="Average rating">{feedback.average !== null ? `${feedback.average.toFixed(2)} / 5` : '-'}</Row>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No feedback yet.</p>
          )}
        </Section>
        <Section title="Communication">
          <dl className="divide-y divide-slate-100">
            <Row label="Announcements, last 24 h">{communication.announcementsLast24h}</Row>
            <Row label="Latest">{communication.lastAnnouncementAt ? `${formatDate(communication.lastAnnouncementAt)}, ${clock(communication.lastAnnouncementAt)}` : 'None sent'}</Row>
          </dl>
        </Section>
      </div>

      <Section title="Recent activity" hint="The latest check-ins and check-outs.">
        {c.activity.length === 0 ? (
          <p className="text-sm text-slate-500">No one has been scanned in yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm" data-testid="activity">
            {c.activity.map((a, i) => (
              <li key={`${a.name}-${a.at}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2 text-slate-800">
                  <Icon name="check" className="h-4 w-4 text-emerald-600" />
                  {a.name} <span className="text-slate-500">{a.action}</span>
                </span>
                <time dateTime={a.at} className="text-xs text-slate-500">{clock(a.at)}</time>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <p className="text-xs text-slate-500">Everything on this page comes from this event&apos;s own records. Anything the platform cannot know, such as how crowded an area is, only appears when someone reports it.</p>
    </div>
  );
}
