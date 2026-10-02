import { Link } from 'react-router-dom';
import { dateChip } from '../../utils/calendar.js';
import { modeLabel } from '../../utils/constants.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import Badge from '../ui/Badge.jsx';
import { buttonClasses } from '../ui/Button.jsx';
import FavoriteButton from '../ui/FavoriteButton.jsx';
import Icon from '../ui/Icon.jsx';
import EventBanner from './EventBanner.jsx';

function Meta({ icon, children }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** Marketplace-style event card. `canFavorite` shows the heart (participants only). */
export default function EventCard({ event, canFavorite = false, reason, onFavorite }) {
  const full = event.availableSeats === 0;
  const chip = dateChip(event.date);
  const registered = event.maxParticipants - event.availableSeats;

  return (
    <article className="surface surface-lift group flex flex-col overflow-hidden" data-testid="event-card">
      <EventBanner event={event} className="h-44">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" aria-hidden="true" />
        <div className="absolute left-3 top-3">
          <Badge tone="dark">{event.type}</Badge>
        </div>
        {canFavorite && <FavoriteButton eventId={event.id} initial={event.favorite} onChange={onFavorite} className="absolute right-3 top-3" />}
        <div className="absolute bottom-3 left-3 flex flex-col items-center rounded-xl bg-white/95 px-2.5 py-1 text-center shadow-sm backdrop-blur" aria-hidden="true">
          <span className="text-[0.65rem] font-bold tracking-wider text-indigo-600">{chip.month}</span>
          <span className="text-lg font-extrabold leading-none text-slate-900">{chip.day}</span>
        </div>
        {(full || event.status === 'ongoing') && (
          <div className="absolute bottom-3 right-3">
            {full ? <Badge tone="red">Full</Badge> : <Badge tone="green">Live now</Badge>}
          </div>
        )}
      </EventBanner>

      <div className="flex flex-1 flex-col p-5">
        {reason && <p className="mb-1.5 text-xs font-semibold text-indigo-600">{reason}</p>}
        <h3 className="text-lg font-bold leading-snug text-slate-900 transition-colors group-hover:text-indigo-700">{event.name}</h3>

        <ul className="mt-3 space-y-1.5 text-sm text-slate-600">
          <Meta icon="calendar">
            {formatEventDates(event)}
            <span className="text-slate-400"> - {formatTimeRange(event.startTime, event.endTime)}</span>
          </Meta>
          <Meta icon={event.mode === 'online' ? 'globe' : 'pin'}>
            {event.venue}
            {event.mode !== 'offline' && <span className="text-slate-400"> ({modeLabel(event.mode)})</span>}
          </Meta>
          <Meta icon="users">
            <span className="font-semibold text-slate-900">{registered}</span> of {event.maxParticipants} registered
          </Meta>
        </ul>

        <Link to={`/events/${event.id}`} className={buttonClasses('secondary', 'md', 'mt-5 w-full group-hover:border-indigo-300 group-hover:bg-indigo-50 group-hover:text-indigo-700')}>
          View Details
          <Icon name="arrow-right" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="surface overflow-hidden" aria-hidden="true">
      <div className="h-44 animate-pulse bg-slate-200" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
      </div>
    </div>
  );
}
