import { Link } from 'react-router-dom';
import { eventsApi } from '../../api';
import EventsTable from '../../components/events/EventsTable.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';

export default function MyEventsPage() {
  const { data, error, loading, reload } = useApi((signal) => eventsApi.mine(signal));

  return (
    <>
      <PageHeader
        title="Events"
        description="Every event you have created."
        action={
          <Link to="/organizer/create-event" className={buttonClasses('primary')}>
            <Icon name="plus" className="h-4 w-4" />
            Create Event
          </Link>
        }
      />

      {loading ? (
        <PageLoader label="Loading your events..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.events.length ? (
        <EventsTable events={data.events} manage />
      ) : (
        <EmptyState
          icon="calendar"
          title="You have not created any events yet"
          description="Select Create Event to add your first one. It will be listed here and shown to participants."
        />
      )}
    </>
  );
}
