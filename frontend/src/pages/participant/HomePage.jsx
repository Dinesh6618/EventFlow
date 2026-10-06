import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { certificatesApi, eventsApi, notificationsApi, registrationsApi, scheduleApi, studentApi } from '../../api';
import EventCard, { EventCardSkeleton, registeredEventIds } from '../../components/events/EventCard.jsx';
import GetHelpButton from '../../components/help/GetHelpButton.jsx';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';
import Badge, { RegistrationStatusBadge } from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import SearchBar from '../../components/ui/SearchBar.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates, formatTime } from '../../utils/format.js';

const ACTIVE = ['pending', 'approved', 'confirmed'];
const UPCOMING_COUNT = 6;
const MY_EVENTS_COUNT = 4;
const CERTIFICATES_COUNT = 3;
const NOTIFICATIONS_COUNT = 4;

function Section({ id, title, link, children }) {
  return (
    <section className="mt-8" aria-labelledby={id}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={id} className="text-lg font-semibold text-slate-900">{title}</h2>
        {link}
      </div>
      {children}
    </section>
  );
}

const TextLink = ({ to, children }) => (
  <Link to={to} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">{children}</Link>
);

/** Today's sessions as plain rows: time, title, and the event it belongs to. */
function TodayList({ items }) {
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {items.map((s) => (
          <li key={s.id} className="flex gap-4 px-4 py-3">
            <p className="w-20 shrink-0 text-sm font-medium text-slate-900">{formatTime(s.startTime)}</p>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                {s.title}
                {s.status === 'ongoing' && <Badge tone="green">Happening now</Badge>}
              </p>
              <p className="text-sm text-slate-500">{[s.eventName, s.venue].filter(Boolean).join(' · ')}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The student's next few registrations, each with its pass. */
function MyEventsList({ registrations }) {
  if (registrations.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">You have no upcoming events yet. Register for one and it will show up here.</p>
        <Link to="/events" className={buttonClasses('secondary', 'sm')}>Explore events</Link>
      </Card>
    );
  }
  return (
    <Card data-testid="next-event">
      <ul className="divide-y divide-slate-100">
        {registrations.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0">
              <Link to={`/events/${r.eventId}`} className="text-sm font-medium text-slate-900 hover:text-indigo-700">{r.eventName}</Link>
              <p className="text-sm text-slate-500">{formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })} · {r.eventVenue}</p>
            </div>
            <div className="flex items-center gap-3">
              <RegistrationStatusBadge status={r.status} />
              <Link to={`/my/registrations/${r.id}/pass`} className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                <Icon name="qr" className="h-4 w-4" />
                QR Pass
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Latest certificates: event, type, date and a link to verify. */
function CertificateStrip({ certificates, types }) {
  if (certificates.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-600">No certificates yet. When an organizer issues one for an event you took part in, it will appear here.</p>
      </Card>
    );
  }
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {certificates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3" data-testid="home-certificate">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon name="award" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{c.eventName}</p>
                <p className="text-sm text-slate-500">
                  {types?.[c.type] ?? c.type} · {new Date(c.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            </div>
            <Link to={`/verify/${c.code}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Verify</Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Latest notifications. Opening one marks it read, like the bell does. */
function NotificationList({ notifications }) {
  if (notifications.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-600">You are all caught up. New updates about your events will show up here.</p>
      </Card>
    );
  }
  const open = (n) => {
    if (!n.read) notificationsApi.markRead(n.id).catch(() => {});
  };
  return (
    <Card>
      <ul className="divide-y divide-slate-100">
        {notifications.map((n) => (
          <li key={n.id}>
            <Link to={n.link || '/notifications'} onClick={() => open(n)} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-indigo-600'}`} aria-label={n.read ? undefined : 'Unread'} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{n.title}</span>
                <span className="line-clamp-1 text-sm text-slate-500">{n.message}</span>
              </span>
              <span className="shrink-0 text-xs text-slate-400">{timeAgo(n.createdAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const dashboard = useApi((signal) => studentApi.dashboard(signal), [], { refreshMs: 60000 });
  const today = useApi((signal) => scheduleApi.myToday(signal), [], { refreshMs: 60000 });
  const upcoming = useApi((signal) => eventsApi.list({}, signal), []);
  const mine = useApi((signal) => registrationsApi.mine(signal), []);
  const certs = useApi((signal) => certificatesApi.mine(signal), []);
  const notes = useApi((signal) => notificationsApi.list({ limit: NOTIFICATIONS_COUNT }, signal), [], { refreshMs: 60000 });

  const registrations = mine.data?.registrations;
  const registeredIds = useMemo(() => registeredEventIds(registrations), [registrations]);
  const myEvents = useMemo(
    () =>
      (registrations ?? [])
        .filter((r) => ACTIVE.includes(r.status) && r.eventStatus !== 'ended')
        .sort((a, b) => `${a.eventDate}${a.eventStartTime}`.localeCompare(`${b.eventDate}${b.eventStartTime}`))
        .slice(0, MY_EVENTS_COUNT),
    [registrations],
  );
  const latestCerts = useMemo(
    () => [...(certs.data?.certificates ?? [])].sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt))).slice(0, CERTIFICATES_COUNT),
    [certs.data],
  );

  const first = user.name.split(' ')[0];

  const search = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/events?q=${encodeURIComponent(term)}` : '/events');
  };

  const skeletons = (label) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label={label}>
      {[0, 1, 2].map((n) => <EventCardSkeleton key={n} />)}
    </div>
  );

  // Small sections wait quietly while they load and say what went wrong if they fail.
  const waiting = (query, label) => (
    query.error ? <LoadError error={query.error} onRetry={query.reload} /> : <p className="text-sm text-slate-500" role="status">{label}</p>
  );

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Welcome back, {first} <span aria-hidden="true">👋</span></h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">Find events happening around your campus.</p>
      </div>

      <form onSubmit={search} className="flex gap-2" aria-label="Search events">
        <SearchBar className="flex-1" id="home-search" label="Search events" placeholder="Search events, workshops, hackathons..." value={q} onChange={setQ} />
        <Button type="submit" size="lg">Search</Button>
      </form>

      {today.data?.items.length > 0 && (
        <Section id="today-heading" title="Today's Schedule" link={<TextLink to="/my/schedule">Full schedule</TextLink>}>
          <TodayList items={today.data.items} />
        </Section>
      )}

      <Section id="upcoming-heading" title="Upcoming Events" link={<TextLink to="/events">See all events</TextLink>}>
        {upcoming.error ? (
          <LoadError error={upcoming.error} onRetry={upcoming.reload} />
        ) : !upcoming.data ? (
          skeletons('Loading upcoming events')
        ) : upcoming.data.events.length === 0 ? (
          <EmptyState icon="calendar" title="No upcoming events" description="New events will appear here as soon as organizers publish them." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.data.events.slice(0, UPCOMING_COUNT).map((event) => (
              <EventCard key={event.id} event={event} canFavorite registered={registeredIds.has(event.id)} />
            ))}
          </div>
        )}
      </Section>

      <Section id="rec-heading" title="Recommended Events">
        {dashboard.error ? (
          <LoadError error={dashboard.error} onRetry={dashboard.reload} />
        ) : !dashboard.data ? (
          skeletons('Loading recommendations')
        ) : dashboard.data.recommended.length === 0 ? (
          <EmptyState icon="compass" title="Nothing to recommend right now" description="You are signed up for everything that is open, or no new events have been published yet." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.data.recommended.map((event) => (
              <EventCard key={event.id} event={event} canFavorite reason={event.reason} registered={registeredIds.has(event.id)} />
            ))}
          </div>
        )}
      </Section>

      <Section id="my-events-heading" title="My Events" link={<TextLink to="/my/registrations">View all</TextLink>}>
        {mine.data ? <MyEventsList registrations={myEvents} /> : waiting(mine, 'Loading your events...')}
      </Section>

      <Section id="certificates-heading" title="Certificates" link={<TextLink to="/my/certificates">View all</TextLink>}>
        {certs.data ? <CertificateStrip certificates={latestCerts} types={certs.data.types} /> : waiting(certs, 'Loading your certificates...')}
      </Section>

      <Section id="notifications-heading" title="Notifications" link={<TextLink to="/notifications">View all</TextLink>}>
        {notes.data ? <NotificationList notifications={notes.data.notifications} /> : waiting(notes, 'Loading notifications...')}
      </Section>

      <section aria-label="Help" className="mt-8">
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Need help at an event?</h2>
            <p className="mt-0.5 text-sm text-slate-500">Medical, security, technical, venue or lost &amp; found. Report it in a few taps and follow the reply.</p>
          </div>
          <GetHelpButton inline label="Get help" className="shrink-0" />
        </Card>
      </section>
    </>
  );
}
