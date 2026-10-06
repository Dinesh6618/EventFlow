import { Link } from 'react-router-dom';
import { adminApi, adminEmailApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import EventsTable from '../../components/events/EventsTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useApi } from '../../hooks/useApi.js';

// Only areas that exist today. Each one links to its own admin page.
const AREAS = [
  { to: '/admin/help', icon: 'shield', title: 'Help management', text: 'Help requests, categories, emergency contacts, response teams and escalation rules.' },
  { to: '/admin/volunteers', icon: 'heart', title: 'Volunteers', text: 'Volunteer reports, activity log, who may volunteer and check-in rules.' },
  { to: '/admin/email', icon: 'mail', title: 'Email', text: 'Whether email is set up, what has been sent, and a test message.' },
];

export default function AdminDashboard() {
  const { data, error, loading, reload } = useApi((signal) => adminApi.stats(signal));
  const stats = data?.stats;
  const email = useApi((signal) => adminEmailApi.status(signal)).data;

  return (
    <>
      <PageHeader title="Admin dashboard" description="Platform overview." />

      {email && !email.configured && (
        <Alert type="warning" className="mb-6" action={<Link to="/admin/email" className="shrink-0 font-semibold underline">Open Email settings</Link>}>
          <p className="font-semibold">Email is not set up.</p>
          <p>EventFlow cannot send verification or event emails until the email provider is configured.</p>
        </Alert>
      )}

      {email?.configured && email.recentFailures?.last24h > 0 && (
        <Alert type="error" className="mb-6" action={<Link to="/admin/email" className="shrink-0 font-semibold underline">See the email log</Link>}>
          <p className="font-semibold">{email.recentFailures.last24h} {email.recentFailures.last24h === 1 ? 'email' : 'emails'} could not be delivered in the last 24 hours.</p>
          <p>Latest problem: {email.recentFailures.latest?.errorMessage ?? 'unknown'}</p>
        </Alert>
      )}

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <div className="space-y-8">
          <section aria-labelledby="admin-users">
            <h2 id="admin-users" className="mb-4 text-lg font-semibold text-slate-900">Users</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total users" value={stats?.totalUsers} icon="users" loading={loading} />
              <StatCard label="Organizers" value={stats?.users.organizer} icon="user" loading={loading} />
              <StatCard label="Students" value={stats?.users.participant} icon="user" loading={loading} />
              <StatCard label="Admins" value={stats?.users.admin} icon="shield" loading={loading} />
            </div>
          </section>

          <section aria-labelledby="admin-event-stats">
            <h2 id="admin-event-stats" className="mb-4 text-lg font-semibold text-slate-900">Events</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total events" value={stats?.totalEvents} icon="calendar" loading={loading} />
              <StatCard label="Upcoming events" value={stats?.upcomingEvents} icon="clock" loading={loading} />
              <StatCard label="Active events" value={stats?.activeEvents} icon="zap" loading={loading} hint="running or open for registration" />
              <StatCard label="Registrations" value={stats?.totalParticipants} icon="ticket" loading={loading} hint="across all events" />
            </div>
          </section>

          <section aria-labelledby="admin-areas">
            <h2 id="admin-areas" className="mb-4 text-lg font-semibold text-slate-900">Manage</h2>
            <ul className="grid gap-4 md:grid-cols-3">
              {AREAS.map((a) => (
                <li key={a.to}>
                  <Link to={a.to} className="surface surface-lift flex h-full items-start gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Icon name={a.icon} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-slate-900">{a.title}</span>
                      <span className="mt-0.5 block text-sm text-slate-500">{a.text}</span>
                    </span>
                    <Icon name="arrow-right" className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="admin-events">
            <h2 id="admin-events" className="mb-4 text-lg font-semibold text-slate-900">All events</h2>
            {loading ? (
              <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading events" />
            ) : data.events.length ? (
              <EventsTable events={data.events} />
            ) : (
              <EmptyState icon="calendar" title="No events yet" description="Events created by organizers will appear here." />
            )}
          </section>
        </div>
      )}
    </>
  );
}
