import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { eventsApi } from '../../../api';
import { EventStatusBadge } from '../../../components/ui/Badge.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import { useAuth } from '../../../context/AuthContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { formatEventWhen } from '../../../utils/format.js';

// Each phase adds its own tab here.
const TABS = [
  { to: '', label: 'Overview', end: true },
  { to: 'control-center', label: 'Control center' },
  { to: 'insights', label: 'Insights' },
  { to: 'scan', label: 'QR Scan' },
  { to: 'attendance', label: 'Attendance' },
  { to: 'schedule', label: 'Schedule' },
  { to: 'teams', label: 'Teams' },
  { to: 'judging', label: 'Judging' },
  { to: 'feedback', label: 'Feedback' },
  { to: 'certificates', label: 'Certificates' },
  { to: 'announcements', label: 'Announcements' },
  { to: 'staff', label: 'Volunteers' },
];

/** Shell for everything an organizer does with one event. Child pages read the event via useEvent(). */
export default function EventManageLayout() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi((signal) => eventsApi.get(eventId, signal), [eventId]);

  if (!data && loading) return <PageLoader label="Loading event..." />;
  if (error?.status === 404) return <EmptyState icon="calendar" title="Event not found" description="It may have been removed." action={<Link to="/organizer/events" className="font-medium text-indigo-600">Back to My Events</Link>} />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { event } = data;
  if (event.organizerId !== user.id) {
    return <EmptyState icon="alert" title="You can only manage your own events" action={<Link to="/organizer/events" className="font-medium text-indigo-600">Back to My Events</Link>} />;
  }

  return (
    <>
      <Link to="/organizer/events" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        My events
      </Link>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{event.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {formatEventWhen(event)} - {event.venue}
          </p>
        </div>
        <EventStatusBadge event={event} />
      </div>

      <nav aria-label="Event sections" className="mb-6 -mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 whitespace-nowrap">
          {TABS.map((tab) => (
            <li key={tab.label}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `-mb-px block border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet context={{ event, reloadEvent: reload }} />
    </>
  );
}

export const useEvent = () => useOutletContext();
