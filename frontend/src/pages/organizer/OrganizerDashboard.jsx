import { Link } from 'react-router-dom';
import { analyticsApi, organizerApi } from '../../api';
import ChartCard from '../../components/charts/ChartCard.jsx';
import TrendChart from '../../components/charts/TrendChart.jsx';
import EventsTable from '../../components/events/EventsTable.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';

function Activity({ items }) {
  if (!items.length) return <p className="text-sm text-slate-500">Nothing yet. Registrations and check-ins appear here as they happen.</p>;
  return (
    <ul className="divide-y divide-slate-100" aria-label="Recent activity">
      {items.map((a, i) => (
        <li key={`${a.kind}-${a.person}-${a.at}-${i}`} className="flex items-start gap-3 py-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${a.kind === 'registered' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
            <Icon name={a.kind === 'registered' ? 'ticket' : 'check'} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{a.person}</span> {a.kind === 'registered' ? 'registered for' : 'checked in to'}{' '}
              <Link to={`/organizer/events/${a.eventId}`} className="font-medium text-indigo-600 hover:text-indigo-700">{a.eventName}</Link>
            </p>
            <p className="text-xs text-slate-400">{timeAgo(a.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const stats = useApi((signal) => organizerApi.stats(signal));
  const analytics = useApi((signal) => analyticsApi.get({}, signal), []);
  const activity = useApi((signal) => organizerApi.activity(signal), [], { refreshMs: 30000 });

  const summary = analytics.data?.summary;
  const trend = analytics.data?.charts.registrationTrend ?? [];
  const loading = stats.loading || analytics.loading;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Here is how your events are doing."
        action={
          <div className="flex flex-wrap gap-3">
            <Link to="/organizer/section/scan" className={buttonClasses('secondary')}>
              <Icon name="qr" className="h-4 w-4" />
              Scan QR
            </Link>
            <Link to="/organizer/create-event" className={buttonClasses('primary')}>
              <Icon name="plus" className="h-4 w-4" />
              Create event
            </Link>
          </div>
        }
      />

      {stats.error ? (
        <LoadError error={stats.error} onRetry={stats.reload} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Events" value={stats.data?.stats.totalEvents} icon="calendar" tone="indigo" loading={stats.loading} />
            <StatCard label="Participants" value={stats.data?.stats.totalParticipants} icon="users" tone="sky" loading={stats.loading} />
            <StatCard label="Attendance Rate" value={summary ? `${summary.attendanceRate}%` : undefined} icon="qr" tone="green" loading={analytics.loading} hint="of approved registrations" />
            <StatCard
              label="Feedback Rating"
              value={summary ? (summary.averageFeedback === null ? '-' : `${summary.averageFeedback.toFixed(1)} / 5`) : undefined}
              icon="star"
              tone="amber"
              loading={analytics.loading}
              hint={summary ? `${summary.feedbackResponses} response${summary.feedbackResponses === 1 ? '' : 's'}` : undefined}
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {analytics.error ? (
              <LoadError error={analytics.error} onRetry={analytics.reload} />
            ) : (
              <ChartCard
                title="Registration trend"
                subtitle="Running total of registrations across your events."
                empty={trend.length === 0}
                emptyText={loading ? 'Loading...' : 'No registrations yet.'}
                table={{ columns: ['Date', 'New that day', 'Running total'], rows: trend.map((p) => [p.label, p.value, p.total]) }}
              >
                <TrendChart points={trend.map((p) => ({ label: p.label, value: p.total, extra: p.value }))} valueName="Registrations so far" extraName="New that day" ariaLabel="Registrations over time" />
              </ChartCard>
            )}

            <Card className="p-5">
              <h2 className="text-base font-bold text-slate-900">Recent activity</h2>
              <div className="mt-2">{activity.error ? <LoadError error={activity.error} onRetry={activity.reload} /> : <Activity items={activity.data?.activity ?? []} />}</div>
            </Card>
          </div>

          <section className="mt-10" aria-labelledby="upcoming-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="upcoming-heading" className="text-xl font-bold text-slate-900">Upcoming events</h2>
              <Link to="/organizer/events" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">View all events</Link>
            </div>
            {stats.loading ? (
              <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading events" />
            ) : stats.data.upcomingEvents.length ? (
              <EventsTable events={stats.data.upcomingEvents} manage />
            ) : (
              <EmptyState
                icon="calendar"
                title="No upcoming events"
                description="Create your first event and it will show up here."
                action={<Link to="/organizer/create-event" className={buttonClasses('primary')}>Create event</Link>}
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
