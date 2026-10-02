import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { eventsApi } from '../../api';
import EventCard, { EventCardSkeleton } from '../../components/events/EventCard.jsx';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Checkbox, Select } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import SearchBar from '../../components/ui/SearchBar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import { DEPARTMENTS, EVENT_MODES, ROLES } from '../../utils/constants.js';
import { todayISO } from '../../utils/format.js';

const CHIPS = [
  { value: '', label: 'All' },
  { value: 'Hackathon', label: 'Hackathon' },
  { value: 'Workshop', label: 'Workshop' },
  { value: 'Seminar', label: 'Seminar' },
  { value: 'Competition', label: 'Competition' },
  { value: 'Cultural Event', label: 'Cultural' },
];

export default function ExplorePage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const isStudent = user.role === ROLES.PARTICIPANT;
  const [filters, setFilters] = useState({ q: params.get('q') ?? '', type: '', date: '', mode: '', department: '', available: false, favorites: false });
  const [showFilters, setShowFilters] = useState(false);
  const q = useDebounced(filters.q.trim());
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const query = { q, type: filters.type, date: filters.date, mode: filters.mode, department: filters.department, available: filters.available ? 'true' : '', favorites: filters.favorites ? 'true' : '' };
  const { data, error, loading, reload } = useApi((signal) => eventsApi.list(query, signal), [q, filters.type, filters.date, filters.mode, filters.department, filters.available, filters.favorites]);

  const events = data?.events;
  const extraActive = Boolean(filters.date || filters.mode || filters.department || filters.available);
  const anyActive = Boolean(filters.q || filters.type || filters.favorites || extraActive);
  const clear = () => setFilters({ q: '', type: '', date: '', mode: '', department: '', available: false, favorites: false });

  return (
    <>
      <PageHeader eyebrow="Explore" title="Find your next event" description="Hackathons, workshops, seminars and more happening on campus." />

      <SearchBar value={filters.q} onChange={(value) => set({ q: value })} placeholder="Search events, workshops, hackathons..." label="Search events" id="explore-search" />

      <div className="mt-5 flex flex-wrap items-center gap-2" role="group" aria-label="Event type">
        {CHIPS.map((chip) => {
          const on = filters.type === chip.value;
          return (
            <button
              key={chip.label}
              type="button"
              aria-pressed={on}
              onClick={() => set({ type: chip.value })}
              className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${on ? 'grad-brand border-transparent text-white shadow-md shadow-indigo-600/25' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700'}`}
            >
              {chip.label}
            </button>
          );
        })}
        {isStudent && (
          <button
            type="button"
            aria-pressed={filters.favorites}
            onClick={() => set({ favorites: !filters.favorites })}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition-all ${filters.favorites ? 'border-pink-300 bg-pink-50 text-pink-600' : 'border-slate-200 bg-white text-slate-600 hover:border-pink-200 hover:text-pink-600'}`}
          >
            <Icon name="heart" className={`h-4 w-4 ${filters.favorites ? 'fill-current' : ''}`} />
            Saved
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowFilters((s) => !s)}
          aria-expanded={showFilters}
          aria-controls="more-filters"
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:border-indigo-200 hover:text-indigo-700"
        >
          <Icon name="filter" className="h-4 w-4" />
          Filters
          {extraActive && <span className="h-2 w-2 rounded-full bg-indigo-600" aria-label="Filters applied" />}
        </button>
      </div>

      {showFilters && (
        <div id="more-filters" className="surface anim-pop mt-4 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="filter-date" className="mb-1.5 block text-sm font-medium text-slate-700">Date</label>
            <input
              id="filter-date"
              type="date"
              min={todayISO()}
              value={filters.date}
              onChange={(e) => set({ date: e.target.value })}
              className="block w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <Select label="Online / Offline" value={filters.mode} onChange={(e) => set({ mode: e.target.value })} placeholder="Any" options={EVENT_MODES} />
          <Select label="Department" value={filters.department} onChange={(e) => set({ department: e.target.value })} placeholder="All departments" options={DEPARTMENTS} />
          <div className="flex items-end pb-2.5">
            <Checkbox label="Seats available" hint="Hide events that are full" checked={filters.available} onChange={(e) => set({ available: e.target.checked })} />
          </div>
        </div>
      )}

      <div className="mt-7">
        {error ? (
          <LoadError error={error} onRetry={reload} />
        ) : !events ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading events">
            {[0, 1, 2, 3, 4, 5].map((n) => <EventCardSkeleton key={n} />)}
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon="search"
            title={anyActive ? 'No events match your filters' : 'No events available right now'}
            description={anyActive ? 'Try a different search, type or date.' : 'New events will appear here as soon as organizers publish them.'}
            action={anyActive && <Button variant="secondary" onClick={clear}>Clear filters</Button>}
          />
        ) : (
          <>
            <p className="mb-4 text-sm font-medium text-slate-500" aria-live="polite">
              {events.length} {events.length === 1 ? 'event' : 'events'}
            </p>
            <div className={`grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
              {events.map((event) => (
                <EventCard key={event.id} event={event} canFavorite={isStudent} onFavorite={filters.favorites ? reload : undefined} />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
