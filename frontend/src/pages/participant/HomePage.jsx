import { Link } from 'react-router-dom';
import { scheduleApi, studentApi } from '../../api';
import EventBanner from '../../components/events/EventBanner.jsx';
import EventCard, { EventCardSkeleton } from '../../components/events/EventCard.jsx';
import { RegistrationStatusBadge } from '../../components/ui/Badge.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import Timeline from '../../components/ui/Timeline.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';

function NextEvent({ r }) {
  return (
    <Card className="overflow-hidden md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]" data-testid="next-event">
      <EventBanner event={{ name: r.eventName, type: r.eventType, image: r.eventImage }} className="h-48 md:h-full md:min-h-56">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 to-transparent" aria-hidden="true" />
      </EventBanner>
      <div className="flex flex-col p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="indigo">{r.eventType}</Badge>
          <RegistrationStatusBadge status={r.status} />
          {r.eventStatus === 'ongoing' && <Badge tone="green">Happening now</Badge>}
        </div>
        <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{r.eventName}</h3>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li className="flex items-center gap-2.5"><Icon name="calendar" className="h-4 w-4 text-indigo-400" />{formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })}</li>
          <li className="flex items-center gap-2.5"><Icon name="clock" className="h-4 w-4 text-indigo-400" />{formatTimeRange(r.eventStartTime, r.eventEndTime)}</li>
          <li className="flex items-center gap-2.5"><Icon name="pin" className="h-4 w-4 text-indigo-400" />{r.eventVenue}</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to={`/events/${r.eventId}`} className={buttonClasses('primary')}>
            View Event
            <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
          <Link to={`/my/registrations/${r.id}/pass`} className={buttonClasses('secondary')}>
            <Icon name="qr" className="h-4 w-4" />
            Event Pass
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi((signal) => studentApi.dashboard(signal), [], { refreshMs: 60000 });
  const today = useApi((signal) => scheduleApi.myToday(signal), [], { refreshMs: 60000 });

  const stats = data?.stats;
  const first = user.name.split(' ')[0];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">Hi {first}! <span aria-hidden="true">👋</span></h1>
        <p className="mt-1.5 font-medium text-slate-500">Discover <span aria-hidden="true">•</span> Participate <span aria-hidden="true">•</span> Grow</p>
      </div>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Registered" value={stats?.registered} icon="ticket" tone="indigo" loading={loading} />
            <StatCard label="Upcoming" value={stats?.upcoming} icon="calendar" tone="sky" loading={loading} />
            <StatCard label="Certificates" value={stats?.certificates} icon="award" tone="amber" loading={loading} />
            <StatCard label="Events Explored" value={stats?.explored} icon="compass" tone="pink" loading={loading} />
          </div>

          <section className="mt-10" aria-labelledby="next-heading">
            <h2 id="next-heading" className="mb-4 text-xl font-bold text-slate-900">Your Next Event</h2>
            {loading ? (
              <div className="h-56 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading your next event" />
            ) : data.next ? (
              <NextEvent r={data.next} />
            ) : (
              <EmptyState
                icon="ticket"
                title="No upcoming events yet"
                description="Register for an event and it will show up here with your pass."
                action={<Link to="/events" className={buttonClasses('primary')}>Explore Events</Link>}
              />
            )}
          </section>

          {today.data?.items.length > 0 && (
            <section className="mt-10" aria-labelledby="today-heading">
              <h2 id="today-heading" className="mb-4 text-xl font-bold text-slate-900">Today&apos;s schedule</h2>
              <Timeline items={today.data.items.map((s) => ({ ...s, description: s.eventName }))} />
            </section>
          )}

          <section className="mt-10" aria-labelledby="rec-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="rec-heading" className="text-xl font-bold text-slate-900">Recommended For You</h2>
              <Link to="/events" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">See all events</Link>
            </div>
            {loading ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading recommendations">
                {[0, 1, 2].map((n) => <EventCardSkeleton key={n} />)}
              </div>
            ) : data.recommended.length === 0 ? (
              <EmptyState icon="compass" title="Nothing to recommend right now" description="You are signed up for everything that is open, or no new events have been published yet." />
            ) : (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {data.recommended.map((event) => (
                  <EventCard key={event.id} event={event} canFavorite reason={event.reason} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
