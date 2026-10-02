import { useState } from 'react';
import { eventsApi } from '../../api';
import EventCard, { EventCardSkeleton } from '../../components/events/EventCard.jsx';
import EventFilters from '../../components/events/EventFilters.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';

const NO_FILTERS = { q: '', type: '', date: '' };

export default function EventListingPage() {
  const [filters, setFilters] = useState(NO_FILTERS);
  const q = useDebounced(filters.q.trim());

  const { data, error, loading, reload } = useApi(
    (signal) => eventsApi.list({ q, type: filters.type, date: filters.date }, signal),
    [q, filters.type, filters.date],
  );

  const events = data?.events;
  const filtered = Boolean(filters.q || filters.type || filters.date);
  const clear = () => setFilters(NO_FILTERS);

  return (
    <>
      <PageHeader title="Upcoming events" description="Find something to join on campus." />
      <EventFilters filters={filters} onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))} onClear={clear} />

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !events ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading events">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <EventCardSkeleton key={n} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon="search"
          title={filtered ? 'No events match your filters' : 'No events available right now'}
          description={
            filtered ? 'Try a different search, event type or date.' : 'New events will appear here as soon as organizers publish them.'
          }
          action={filtered && <Button variant="secondary" onClick={clear}>Clear filters</Button>}
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-500" aria-live="polite">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </p>
          <div className={`grid gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
