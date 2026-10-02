import { Link } from 'react-router-dom';
import { organizerApi } from '../../api';
import EventsTable from '../../components/events/EventsTable.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';

export default function OrganizerDashboard() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi((signal) => organizerApi.stats(signal));
  const stats = data?.stats;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Here is how your events are doing."
        action={
          <Link to="/organizer/create-event" className={buttonClasses('primary')}>
            Create event
          </Link>
        }
      />

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total events" value={stats?.totalEvents} icon="calendar" tone="indigo" loading={loading} />
            <StatCard label="Upcoming events" value={stats?.upcomingEvents} icon="clock" tone="sky" loading={loading} />
            <StatCard label="Registered participants" value={stats?.totalParticipants} icon="users" tone="green" loading={loading} />
            <StatCard label="Active events" value={stats?.activeEvents} icon="dashboard" tone="amber" loading={loading} />
          </div>

          <section className="mt-10">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Next up</h2>
              <Link to="/organizer/events" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                View all events
              </Link>
            </div>
            {loading ? (
              <div className="h-40 animate-pulse rounded-xl bg-slate-200" aria-label="Loading events" />
            ) : data.upcomingEvents.length ? (
              <EventsTable events={data.upcomingEvents} manage />
            ) : (
              <EmptyState
                icon="calendar"
                title="No upcoming events"
                description="Create your first event and it will show up here."
                action={
                  <Link to="/organizer/create-event" className={buttonClasses('primary')}>
                    Create event
                  </Link>
                }
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
