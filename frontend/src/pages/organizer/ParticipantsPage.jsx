import { organizerApi } from '../../api';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';

export default function ParticipantsPage() {
  const { data, error, loading, reload } = useApi((signal) => organizerApi.participants(signal));

  return (
    <>
      <PageHeader title="Participants" description="People registered for your events." />

      {loading ? (
        <PageLoader label="Loading participants..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.participants.length === 0 ? (
        <EmptyState
          icon="users"
          title="No participants yet"
          description="Event registration is coming in the next release. Once it is live, everyone who signs up for your events will appear here."
        />
      ) : null}
    </>
  );
}
