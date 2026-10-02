import { Link, useParams } from 'react-router-dom';
import { meApi } from '../../api';
import ScanPanel from '../../components/attendance/ScanPanel.jsx';
import { ZoneReporter } from '../../components/insights/ZonePanel.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';

/** Events the signed-in participant volunteers at. */
export function VolunteerHome() {
  const { data, error, loading, reload } = useApi((signal) => meApi.assignments(signal));
  const mine = data?.assignments.filter((a) => a.staffRole === 'volunteer') ?? [];

  return (
    <>
      <PageHeader title="Volunteering" description="Events where you help with check-in." />
      {!data && loading ? (
        <PageLoader />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : mine.length === 0 ? (
        <EmptyState icon="users" title="No volunteer assignments" description="When an organizer adds you as a volunteer, the event will appear here." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {mine.map((a) => (
            <li key={a.eventId}>
              <Card className="p-5">
                <Badge tone="green">Volunteer</Badge>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{a.eventName}</h2>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{formatDate(a.date)}, {formatTimeRange(a.startTime, a.endTime)}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="pin" className="h-4 w-4 text-slate-400" />{a.venue}</p>
                <Link to={`/volunteer/events/${a.eventId}`} className={buttonClasses('primary', 'md', 'mt-4 w-full')}>Open check-in</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Volunteer's check-in screen for one event. Access is enforced by the API; this just shows its answer. */
export function VolunteerEvent() {
  const { eventId } = useParams();
  const { data, error } = useApi((signal) => meApi.assignments(signal));
  const assignment = data?.assignments.find((a) => String(a.eventId) === eventId && a.staffRole === 'volunteer');

  if (!data && !error) return <PageLoader />;
  if (error) return <LoadError error={error} />;
  if (!assignment) {
    return <EmptyState icon="alert" title="You are not a volunteer for this event" action={<Link to="/volunteer" className="font-medium text-indigo-600">Back to volunteering</Link>} />;
  }

  return (
    <>
      <Link to="/volunteer" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Volunteering
      </Link>
      <PageHeader title={assignment.eventName} description={`${formatDate(assignment.date)} - ${assignment.venue}`} />
      <ScanPanel eventId={assignment.eventId} />
      <section aria-label="Crowd levels" className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Report crowd levels</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600">Tell the organizer how busy each area is right now. Your name and the time are recorded with each report.</p>
        <ZoneReporter eventId={assignment.eventId} />
      </section>
    </>
  );
}
