import { Link } from 'react-router-dom';
import { formatDate, formatDateTime, formatTimeRange } from '../../utils/format.js';
import Badge, { EventStatusBadge } from '../ui/Badge.jsx';
import { buttonClasses } from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import EventBanner from './EventBanner.jsx';

function Meta({ icon, children }) {
  return (
    <li className="flex items-start gap-2">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

export default function EventCard({ event }) {
  const full = event.availableSeats === 0;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <EventBanner event={event} className="h-36" />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge tone="indigo">{event.type}</Badge>
          {full ? <Badge tone="red">Full</Badge> : <EventStatusBadge event={event} />}
        </div>

        <h3 className="text-lg font-semibold leading-snug text-slate-900">{event.name}</h3>
        <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{event.description}</p>

        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <Meta icon="calendar">{formatDate(event.date)}</Meta>
          <Meta icon="clock">{formatTimeRange(event.startTime, event.endTime)}</Meta>
          <Meta icon="pin">{event.venue}</Meta>
          <Meta icon="users">
            <span className="font-medium text-slate-900">{event.availableSeats}</span> of {event.maxParticipants} seats available
          </Meta>
        </ul>

        <p className="mt-3 text-xs text-slate-500">Register by {formatDateTime(event.registrationDeadline)}</p>

        <Link to={`/events/${event.id}`} className={buttonClasses('primary', 'md', 'mt-5 w-full')}>
          View Details
        </Link>
      </div>
    </article>
  );
}

export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-hidden="true">
      <div className="h-36 animate-pulse bg-slate-200" />
      <div className="space-y-3 p-5">
        <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}
