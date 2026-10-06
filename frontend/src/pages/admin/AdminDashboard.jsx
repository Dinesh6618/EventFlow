import { Link } from 'react-router-dom';
import { adminApi, adminEmailApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import EventsTable from '../../components/events/EventsTable.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useApi } from '../../hooks/useApi.js';

export default function AdminDashboard() {
  const { data, error, loading, reload } = useApi((signal) => adminApi.stats(signal));
  const stats = data?.stats;
  const email = useApi((signal) => adminEmailApi.status(signal)).data;

  return (
    <>
      <PageHeader title="Admin dashboard" description="Platform overview." />

      {email && !email.configured && (
        <Alert type="error" className="mb-6" action={<Link to="/admin/email" className="shrink-0 font-semibold underline">Open Email settings</Link>}>
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
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total users" value={stats?.totalUsers} icon="users" tone="indigo" loading={loading} />
            <StatCard label="Organizers" value={stats?.users.organizer} icon="user" tone="sky" loading={loading} />
            <StatCard label="Participants" value={stats?.users.participant} icon="user" tone="green" loading={loading} />
            <StatCard label="Total events" value={stats?.totalEvents} icon="calendar" tone="amber" loading={loading} />
          </div>

          <section className="mt-10">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">All events</h2>
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-label="Loading events" />
            ) : data.events.length ? (
              <EventsTable events={data.events} />
            ) : (
              <EmptyState icon="calendar" title="No events yet" description="Events created by organizers will appear here." />
            )}
          </section>
        </>
      )}
    </>
  );
}
