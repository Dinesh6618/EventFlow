import { Link } from 'react-router-dom';
import EventBanner from '../../../components/events/EventBanner.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { buttonClasses } from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import { formatDateTime } from '../../../utils/format.js';
import { useEvent } from './EventManageLayout.jsx';

export default function OverviewPage() {
  const { event } = useEvent();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Registered" value={event.registeredCount} icon="users" tone="indigo" />
        <StatCard label="Seats left" value={event.availableSeats} icon="check" tone="green" />
        <StatCard label="Capacity" value={event.maxParticipants} icon="dashboard" tone="sky" />
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
    </div>
  );
}
