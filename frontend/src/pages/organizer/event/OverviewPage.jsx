import { Link } from 'react-router-dom';
import { scheduleApi } from '../../../api';
import EventBanner from '../../../components/events/EventBanner.jsx';
import ScheduleList from '../../../components/schedule/ScheduleList.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { buttonClasses } from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { formatDateTime } from '../../../utils/format.js';
import { useEvent } from './EventManageLayout.jsx';

export default function OverviewPage() {
  const { event } = useEvent();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Registered" value={event.registeredCount} icon="users" tone="indigo" />
        <StatCard label="Seats left" value={event.availableSeats} icon="check" tone="green" />
        <StatCard label="Capacity" value={event.maxParticipants} icon="dashboard" tone="indigo" />
      </div>

      <Card className="overflow-hidden">
        <EventBanner event={event} className="h-40 sm:h-52" />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone="indigo">{event.type}</Badge>
            {event.requiresApproval && <Badge tone="amber">Approval required</Badge>}
          </div>
          <p className="whitespace-pre-line text-sm text-slate-600">{event.description}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Registration deadline</dt>
              <dd className="font-medium text-slate-900">{formatDateTime(event.registrationDeadline)}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Organizer contact</dt>
              <dd className="font-medium text-slate-900">{event.organizerName} - {event.organizerContact}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
            <Link to={`/events/${event.id}`} className={buttonClasses('secondary', 'sm')}>View public page</Link>
            <Link to={`/organizer/participants?eventId=${event.id}`} className={buttonClasses('secondary', 'sm')}>Participants</Link>
            <Link to={`/organizer/analytics?eventId=${event.id}`} className={buttonClasses('secondary', 'sm')}>Analytics</Link>
          </div>
        </div>
      </Card>

      <SchedulePlan event={event} />
    </div>
  );
}

/** Read-only snapshot of the event's programme, with a way into the full editor. */
function SchedulePlan({ event }) {
  const { data, error, loading, reload } = useApi((signal) => scheduleApi.list(event.id, signal), [event.id]);
  const items = data?.items ?? [];
  const days = new Set(items.map((s) => s.date)).size;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Schedule plan</h2>
          {data && (
            <p className="text-sm text-slate-500">
              {items.length === 0 ? 'No sessions planned yet.' : `${items.length} session${items.length === 1 ? '' : 's'} across ${days} day${days === 1 ? '' : 's'}`}
            </p>
          )}
        </div>
        <Link to="schedule" className={buttonClasses(items.length ? 'secondary' : 'primary', 'sm')}>
          {items.length ? 'Edit schedule' : 'Plan schedule'}
        </Link>
      </div>
      <div className="mt-4">
        {error ? (
          <LoadError error={error} onRetry={reload} />
        ) : !data && loading ? (
          <div className="h-24 animate-pulse rounded-lg bg-slate-100" aria-label="Loading schedule" />
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Add talks, workshops, breaks and rounds so participants know what happens and when.</p>
        ) : (
          <>
            <ScheduleList items={items.slice(0, 6)} nextId={data.next?.id} bare />
            {items.length > 6 && <p className="mt-3 text-sm text-slate-500">and {items.length - 6} more in the full schedule.</p>}
          </>
        )}
      </div>
    </Card>
  );
}
