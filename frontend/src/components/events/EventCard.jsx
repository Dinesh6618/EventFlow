import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { registrationsApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLES, modeLabel } from '../../utils/constants.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import Badge from '../ui/Badge.jsx';
import { buttonClasses } from '../ui/Button.jsx';
import FavoriteButton from '../ui/FavoriteButton.jsx';
import Icon from '../ui/Icon.jsx';
import EventBanner from './EventBanner.jsx';

const HOLDS_SEAT = ['pending', 'approved', 'confirmed'];

/** Ids of the events a list of registrations (from /registrations/mine) holds a seat in. */
export const registeredEventIds = (registrations = []) =>
  new Set(registrations.filter((r) => HOLDS_SEAT.includes(r.status)).map((r) => r.eventId));

/**
 * Ids of the events the signed-in student holds a seat in, so a card can show "Registered" instead of
 * a Register button. Pass `enabled = false` (organizers, admins) to skip the request.
 */
export function useRegisteredEventIds(enabled = true) {
  const { data } = useApi((signal) => (enabled ? registrationsApi.mine(signal) : Promise.resolve(null)), [enabled]);
  return useMemo(() => registeredEventIds(data?.registrations), [data]);
}

function Meta({ icon, children }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/**
 * Simple event card: image, name, date, time, venue, type and one action.
 * `canFavorite` shows the heart (participants only). `registered` swaps Register for the registered state.
 */
export default function EventCard({ event, canFavorite = false, reason, onFavorite, registered = false }) {
  const { user } = useAuth();
  const isStudent = user?.role === ROLES.PARTICIPANT;
  const full = event.availableSeats === 0;

  // One plain badge says where the event stands for this student; the button follows from it.
  let status = <Badge tone="indigo">Registration open</Badge>;
  if (registered) status = <Badge tone="green">Registered</Badge>;
  else if (event.status === 'ended') status = <Badge tone="slate">Ended</Badge>;
  else if (full) status = <Badge tone="red">Full</Badge>;
  else if (!event.registrationOpen) status = <Badge tone="amber">Closed</Badge>;
  const canRegister = isStudent && !registered && !full && event.registrationOpen;

  return (
    <article className="surface surface-lift flex flex-col overflow-hidden" data-testid="event-card">
      <EventBanner event={event} className="h-40">
        {canFavorite && <FavoriteButton eventId={event.id} initial={event.favorite} onChange={onFavorite} className="absolute right-3 top-3" />}
      </EventBanner>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          {status}
          <Badge tone="slate">{event.type}</Badge>
        </div>
        {reason && <p className="mt-2 text-xs font-medium text-indigo-700">{reason}</p>}
        <h3 className="mt-2 text-base font-semibold leading-snug text-slate-900">{event.name}</h3>

        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          <Meta icon="calendar">{formatEventDates(event)}</Meta>
          <Meta icon="clock">{formatTimeRange(event.startTime, event.endTime)}</Meta>
          <Meta icon={event.mode === 'online' ? 'globe' : 'pin'}>
            {event.venue}
            {event.mode !== 'offline' && <span className="text-slate-400"> ({modeLabel(event.mode)})</span>}
          </Meta>
        </ul>

        <Link to={`/events/${event.id}`} className={buttonClasses(canRegister ? 'primary' : 'secondary', 'md', 'mt-4 w-full')}>
          {canRegister ? 'Register' : 'View details'}
        </Link>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="surface overflow-hidden" aria-hidden="true">
      <div className="h-40 animate-pulse bg-slate-200" />
      <div className="space-y-3 p-4">
        <div className="h-4 w-1/4 animate-pulse rounded bg-slate-100" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-9 w-full animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
