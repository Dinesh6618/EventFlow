import { Link } from 'react-router-dom';
import { registrationsApi, scheduleApi } from '../../api';
import Badge, { RegistrationStatusBadge } from '../../components/ui/Badge.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate, formatEventDates, formatTime } from '../../utils/format.js';

const HOLDS_SEAT = ['pending', 'approved', 'confirmed'];
const MAX_EVENTS = 5;

/**
 * The next few events the student holds a seat in, each with its sessions. The schedules load in
 * parallel and one that fails comes back as `items: null` so it cannot blank the whole page.
 */
async function loadSchedule(signal) {
  const { registrations } = await registrationsApi.mine(signal);
  const events = registrations
    .filter((r) => HOLDS_SEAT.includes(r.status) && r.eventStatus !== 'ended')
    .sort((a, b) => `${a.eventDate}${a.eventStartTime}`.localeCompare(`${b.eventDate}${b.eventStartTime}`))
    .slice(0, MAX_EVENTS);
  const results = await Promise.allSettled(events.map((r) => scheduleApi.list(r.eventId, signal)));
  return {
    sections: events.map((registration, i) => ({
      registration,
      items: results[i].status === 'fulfilled' ? results[i].value.items : null,
    })),
  };
}

function groupByDate(items) {
  const groups = new Map();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return [...groups.entries()];
}

/** `9:00 AM  Title`, with venue and speaker underneath, joined by a thin timeline rail. */
function Sessions({ items }) {
  return (
    <ol>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        const live = item.status === 'ongoing';
        return (
          <li key={item.id} className={`flex gap-4 ${item.status === 'past' ? 'opacity-60' : ''}`}>
            <p className="w-20 shrink-0 text-right text-sm font-medium text-slate-900">{formatTime(item.startTime)}</p>
            <div className={`relative min-w-0 flex-1 border-l pl-5 ${last ? 'border-transparent pb-0' : 'border-slate-200 pb-5'}`}>
              <span className={`absolute -left-1.5 top-1.5 h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-indigo-600'}`} aria-hidden="true" />
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                {item.title}
                {live && <Badge tone="green">Happening now</Badge>}
              </p>
              {(item.venue || item.speaker) && <p className="text-sm text-slate-500">{[item.venue, item.speaker].filter(Boolean).join(' · ')}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EventSchedule({ registration: r, items }) {
  const days = items ? groupByDate(items) : [];
  return (
    <section aria-labelledby={`schedule-${r.eventId}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id={`schedule-${r.eventId}`} className="text-lg font-semibold text-slate-900">
          <Link to={`/events/${r.eventId}`} className="hover:text-indigo-700">{r.eventName}</Link>
        </h2>
        <p className="flex items-center gap-2 text-sm text-slate-500">
          {formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })}
          {r.status === 'pending' && <RegistrationStatusBadge status={r.status} />}
        </p>
      </div>
      <Card className="p-5">
        {items === null ? (
          <p className="text-sm text-slate-500">
            We could not load the sessions for this event right now. <Link to={`/events/${r.eventId}`} className="font-medium text-indigo-600 hover:text-indigo-700">Open the event</Link> to try again.
          </p>
        ) : (
          <div className="space-y-5">
            {days.map(([date, sessions]) => (
              <div key={date}>
                {days.length > 1 && <h3 className="mb-3 text-sm font-medium text-slate-500">{formatDate(date)}</h3>}
                <Sessions items={sessions} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

/** Sessions of the events the student is registered for, soonest event first. */
export default function MySchedulePage() {
  const { data, error, loading, reload } = useApi((signal) => loadSchedule(signal), [], { refreshMs: 60000 });

  // Events without any sessions have nothing to show; a failed one stays so the student sees why.
  const sections = (data?.sections ?? []).filter((s) => s.items === null || s.items.length > 0);

  return (
    <>
      <PageHeader title="Schedule" description="Sessions from the events you are registered for." />
      {!data && loading ? (
        <PageLoader label="Loading your schedule..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : sections.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No sessions yet"
          description={
            data.sections.length === 0
              ? 'Register for an event to see its schedule here.'
              : 'The organizers have not published sessions for your events yet. Check back closer to the day.'
          }
          action={
            data.sections.length === 0 ? (
              <Link to="/events" className={buttonClasses('primary')}>Explore Events</Link>
            ) : (
              <Link to="/my/registrations" className={buttonClasses('secondary')}>My Events</Link>
            )
          }
        />
      ) : (
        <div className="space-y-8">
          {sections.map((s) => (
            <EventSchedule key={s.registration.id} registration={s.registration} items={s.items} />
          ))}
        </div>
      )}
    </>
  );
}
