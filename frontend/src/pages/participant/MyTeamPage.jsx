import { useState } from 'react';
import { Link } from 'react-router-dom';
import { registrationsApi } from '../../api';
import TeamsPanel from '../../components/teams/TeamsPanel.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Select } from '../../components/ui/FormField.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';

const ACTIVE = ['pending', 'approved', 'confirmed'];

/** Team space: choose one of your team events, then manage your team and find teammates. */
export default function MyTeamPage() {
  const { data, error, loading, reload } = useApi((signal) => registrationsApi.mine(signal));
  const [chosen, setChosen] = useState('');

  if (!data && loading) return <PageLoader label="Loading your teams..." />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const events = data.registrations.filter((r) => ACTIVE.includes(r.status) && r.teamEnabled && r.eventStatus !== 'ended');
  const current = events.find((r) => String(r.eventId) === chosen) ?? events[0];

  return (
    <>
      <PageHeader title="My Team" description="Build your team, invite people with the skills you need, and keep your project together." />
      {events.length === 0 ? (
        <EmptyState
          icon="users"
          title="No team events yet"
          description="Register for an event that allows teams, such as a hackathon, and your team space appears here."
          action={<Link to="/events" className={buttonClasses('primary')}>Explore Events</Link>}
        />
      ) : (
        <div className="space-y-6">
          {events.length > 1 && (
            <div className="max-w-sm">
              <Select label="Event" value={String(current.eventId)} onChange={(e) => setChosen(e.target.value)} options={events.map((r) => ({ value: String(r.eventId), label: r.eventName }))} />
            </div>
          )}
          <p className="text-sm text-slate-500">
            Team space for <Link to={`/events/${current.eventId}`} className="font-medium text-indigo-600 hover:text-indigo-700">{current.eventName}</Link>
          </p>
          <TeamsPanel key={current.eventId} event={{ id: current.eventId, name: current.eventName }} />
        </div>
      )}
    </>
  );
}
