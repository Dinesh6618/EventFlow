import { Link, Navigate, useParams } from 'react-router-dom';
import { eventsApi } from '../../api';
import Badge, { EventStatusBadge } from '../../components/ui/Badge.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates } from '../../utils/format.js';

// Sidebar entry -> the event tab it opens, and how to introduce it.
const SECTIONS = {
  scan: { tab: 'scan', title: 'QR Scan', text: 'Scan participant QR codes to confirm their attendance.', icon: 'qr' },
  attendance: { tab: 'attendance', title: 'Attendance', text: 'See who checked in and export the list.', icon: 'qr' },
  schedule: { tab: 'schedule', title: 'Schedule', text: 'Plan sessions, talks and breaks.', icon: 'clock' },
  help: { tab: 'help', title: 'Help Center', text: 'Live help requests from participants: acknowledge, assign and resolve.', icon: 'shield' },
  volunteers: { tab: 'volunteers', title: 'Volunteer Management', text: 'Departments, shifts, assignments, tasks, attendance and announcements for your volunteers.', icon: 'heart' },
  teams: { tab: 'teams', title: 'Teams', text: 'Team rules, teams and participants without a team.', icon: 'user-plus' },
  judging: { tab: 'judging', title: 'Judging', text: 'Criteria, judges, scoring progress and the leaderboard.', icon: 'trophy' },
  certificates: { tab: 'certificates', title: 'Certificates', text: 'Issue and manage certificates.', icon: 'award' },
  feedback: { tab: 'feedback', title: 'Feedback', text: 'Ratings and comments from participants.', icon: 'message' },
};

/** These sections work on one event at a time, so the sidebar entry first asks which event. */
export default function EventSectionPicker() {
  const { section } = useParams();
  const info = SECTIONS[section];
  const { data, error, loading, reload } = useApi((signal) => eventsApi.mine(signal));

  if (!info) return <Navigate to="/organizer/dashboard" replace />;

  return (
    <>
      <PageHeader title={`${info.title}: choose an event`} description={info.text} />
      {loading ? (
        <PageLoader label="Loading your events..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : data.events.length === 0 ? (
        <EmptyState icon={info.icon} title="Create an event first" description={`${info.title} belongs to an event.`} action={<Link to="/organizer/create-event" className={buttonClasses('primary')}>Create Event</Link>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Your events">
          {data.events.map((event) => (
            <li key={event.id}>
              <Link to={`/organizer/events/${event.id}/${info.tab}`} className="block rounded-lg">
                <Card hover className="flex h-full items-center gap-4 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Icon name={info.icon} className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{event.name}</p>
                    <p className="text-sm text-slate-500">{formatEventDates(event)}</p>
                    <div className="mt-1.5 flex gap-2"><Badge tone="indigo">{event.type}</Badge><EventStatusBadge event={event} /></div>
                  </div>
                  <Icon name="arrow-right" className="h-5 w-5 shrink-0 text-slate-400" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
