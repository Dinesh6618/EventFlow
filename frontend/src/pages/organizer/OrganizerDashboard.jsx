import { Link } from 'react-router-dom';
import { analyticsApi, helpApi, organizerApi } from '../../api';
import ChartCard from '../../components/charts/ChartCard.jsx';
import TrendChart from '../../components/charts/TrendChart.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

function Activity({ items }) {
  if (!items.length) return <p className="text-sm text-slate-500">Nothing yet. Registrations and check-ins appear here as they happen.</p>;
  return (
    <ul className="divide-y divide-slate-100" aria-label="Recent activity">
      {items.map((a, i) => (
        <li key={`${a.kind}-${a.person}-${a.at}-${i}`} className="flex items-start gap-3 py-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a.kind === 'registered' ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Icon name={a.kind === 'registered' ? 'ticket' : 'check'} className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{a.person}</span> {a.kind === 'registered' ? 'registered for' : 'checked in to'}{' '}
              <Link to={`/organizer/events/${a.eventId}`} className="font-medium text-indigo-600 hover:text-indigo-700">{a.eventName}</Link>
            </p>
            <p className="text-xs text-slate-400">{timeAgo(a.at)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function UpcomingTable({ events }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Event</th>
            <th scope="col" className="px-4 py-3">Date &amp; time</th>
            <th scope="col" className="hidden px-4 py-3 sm:table-cell">Venue</th>
            <th scope="col" className="px-4 py-3">Registered</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {events.map((event) => (
            <tr key={event.id} className="hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link to={`/organizer/events/${event.id}`} className="font-medium text-slate-900 hover:text-indigo-700">
                  {event.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {formatEventDates(event)}
                <span className="block text-xs text-slate-500">{formatTimeRange(event.startTime, event.endTime)}</span>
              </td>
              <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{event.venue}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{event.registeredCount} / {event.maxParticipants}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const stats = useApi((signal) => organizerApi.stats(signal));
  const analytics = useApi((signal) => analyticsApi.get({}, signal), []);
  const activity = useApi((signal) => organizerApi.activity(signal), [], { refreshMs: 30000 });
  const help = useApi((signal) => helpApi.organizerSummary(signal), [], { refreshMs: 15000 });

  const summary = analytics.data?.summary;
  const trend = analytics.data?.charts.registrationTrend ?? [];
  const loading = stats.loading || analytics.loading;
  // Shown once the figure has loaded; a dash if the analytics request failed.
  const figure = (value) => (summary ? value : analytics.loading ? undefined : '-');

  return (
    <>
      <PageHeader
        title={`${greeting()} 👋`}
        description={`Welcome back, ${user.name.split(' ')[0]}. Here is how your events are doing.`}
        action={
          <div className="flex flex-wrap gap-3">
            <Link to="/organizer/section/scan" className={buttonClasses('secondary')}>
              <Icon name="qr" className="h-4 w-4" />
              Scan QR
            </Link>
            <Link to="/organizer/create-event" className={buttonClasses('primary')}>
              <Icon name="plus" className="h-4 w-4" />
              Create Event
            </Link>
          </div>
        }
      />

      {stats.error ? (
        <LoadError error={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Events" value={stats.data?.stats.totalEvents} icon="calendar" loading={stats.loading} />
            <StatCard label="Registrations" value={stats.data?.stats.totalParticipants} icon="users" loading={stats.loading} />
            <StatCard
              label="Attendance"
              value={figure(summary?.totalAttendance)}
              icon="qr"
              loading={analytics.loading}
              hint={summary ? `${summary.attendanceRate}% of approved registrations` : undefined}
            />
            <StatCard label="Upcoming Events" value={stats.data?.stats.upcomingEvents} icon="clock" loading={stats.loading} hint="not started yet" />
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            {analytics.error ? (
              <LoadError error={analytics.error} onRetry={analytics.reload} />
            ) : (
              <ChartCard
                title="Registration Overview"
                subtitle="Running total of registrations across your events."
                className="h-full"
                empty={trend.length === 0}
                emptyText={loading ? 'Loading...' : 'No registrations yet.'}
                table={{ columns: ['Date', 'New that day', 'Running total'], rows: trend.map((p) => [p.label, p.value, p.total]) }}
              >
                <TrendChart points={trend.map((p) => ({ label: p.label, value: p.total, extra: p.value }))} valueName="Registrations so far" extraName="New that day" ariaLabel="Registrations over time" />
              </ChartCard>
            )}

            <section aria-labelledby="activity-heading">
              <Card className="h-full p-5">
                <h2 id="activity-heading" className="text-base font-semibold text-slate-900">Recent Activity</h2>
                <div className="mt-2">{activity.error ? <LoadError error={activity.error} onRetry={activity.reload} /> : <Activity items={(activity.data?.activity ?? []).slice(0, 6)} />}</div>
              </Card>
            </section>
          </div>

          <section aria-labelledby="upcoming-heading">
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 p-5 pb-4">
                <h2 id="upcoming-heading" className="text-base font-semibold text-slate-900">Upcoming Events</h2>
                <Link to="/organizer/events" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View all</Link>
              </div>
              {stats.loading ? (
                <div className="mx-5 mb-5 h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Loading events" />
              ) : stats.data.upcomingEvents.length ? (
                <UpcomingTable events={stats.data.upcomingEvents} />
              ) : (
                <div className="px-5 pb-6 text-center">
                  <p className="text-sm font-medium text-slate-900">No upcoming events</p>
                  <p className="mt-1 text-sm text-slate-500">Select Create Event above and your first event will show up here.</p>
                </div>
              )}
            </Card>
          </section>

          <section aria-labelledby="help-heading">
              <Card className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="help-heading" className="text-base font-semibold text-slate-900">Help Center</h2>
                    <p className="text-sm text-slate-500">Requests from participants across your events.</p>
                  </div>
                  <Link to="/organizer/section/help" className={buttonClasses('secondary', 'sm')}>Open Help Center</Link>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[['Open requests', help.data?.summary.open], ['Urgent', help.data?.summary.urgent], ['In progress', help.data?.summary.inProgress], ['Resolved', help.data?.summary.resolved]].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-slate-50 p-3">
                      <dt className="text-xs font-medium text-slate-500">{label}</dt>
                      <dd className="mt-0.5 text-2xl font-semibold text-slate-900">{value ?? '-'}</dd>
                    </div>
                  ))}
                </dl>
                {help.data?.urgent.length > 0 && (
                  <ul className="mt-4 space-y-2" aria-label="Urgent requests">
                    {help.data.urgent.map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-900">
                        <span><span className="font-semibold">Urgent:</span> {u.categoryName} at {u.location} <span className="text-red-700/70">({u.eventName})</span></span>
                        <Link to={`/organizer/help/${u.id}?event=${u.eventId}`} className="font-medium underline">View request</Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
          </section>
        </div>
      )}
    </>
  );
}
