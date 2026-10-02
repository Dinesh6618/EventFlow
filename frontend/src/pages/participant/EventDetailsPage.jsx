import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventsApi } from '../../api';
import EventBanner from '../../components/events/EventBanner.jsx';
import AnnouncementsFeed from '../../components/events/AnnouncementsFeed.jsx';
import SchedulePanel from '../../components/schedule/SchedulePanel.jsx';
import FeedbackPanel from '../../components/feedback/FeedbackPanel.jsx';
import LeaderboardPanel from '../../components/judging/LeaderboardPanel.jsx';
import TeamsPanel from '../../components/teams/TeamsPanel.jsx';
import RegistrationPanel from '../../components/events/RegistrationPanel.jsx';
import Badge, { EventStatusBadge } from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLES, homePathFor } from '../../utils/constants.js';
import { formatDate, formatDateTime, formatEventDates, formatTimeRange } from '../../utils/format.js';

function Detail({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="break-words text-sm font-medium text-slate-900">{children}</dd>
      </div>
    </div>
  );
}

export default function EventDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi((signal) => eventsApi.get(id, signal), [id]);

  // Opened in a fresh tab there is nothing to go back to, so fall back to the user's home.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(homePathFor(user.role)));

  if (!data && loading) return <PageLoader label="Loading event..." />;
  if (error?.status === 404) {
    return (
      <EmptyState
        icon="calendar"
        title="Event not found"
        description="It may have been removed, or the link is incorrect."
        action={<Link to="/events" className="font-medium text-indigo-600">Browse events</Link>}
      />
    );
  }
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { event, registration } = data;
  const isParticipant = user.role === ROLES.PARTICIPANT;

  return (
    <>
      <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Back
      </button>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <EventBanner event={event} className="h-48 sm:h-72" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{event.type}</Badge>
            <EventStatusBadge event={event} />
            {event.requiresApproval && <Badge tone="amber">Approval required</Badge>}
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{event.name}</h1>

          <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">About this event</h2>
          <p className="whitespace-pre-line text-slate-600">{event.description}</p>

          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Schedule</h2>
          <SchedulePanel eventId={event.id} />

          {isParticipant && registration && ['pending', 'approved', 'confirmed'].includes(registration.status) && (
            <AnnouncementsFeed eventId={event.id} />
          )}

          {event.teamEnabled && (
            <section id="teams" aria-label="Teams">
              <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Teams</h2>
              {isParticipant && registration && ['pending', 'approved', 'confirmed'].includes(registration.status) ? (
                <TeamsPanel event={event} />
              ) : (
                <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
                  {isParticipant ? 'Register for this event to create or join a team.' : 'Participants who register can create and join teams here.'}
                </p>
              )}
            </section>
          )}

          {event.teamEnabled && event.leaderboardPublished && <LeaderboardPanel eventId={event.id} />}

          {isParticipant && registration && ['pending', 'approved', 'confirmed'].includes(registration.status) && <FeedbackPanel event={event} />}

          <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Organizer</h2>
          <Card className="p-5">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail icon="user" label="Name">{event.organizerName}</Detail>
              <Detail icon="mail" label="Contact">{event.organizerContact}</Detail>
            </dl>
          </Card>
        </div>

        <aside>
          <Card className="space-y-5 p-5 lg:sticky lg:top-24">
            <dl className="space-y-4">
              <Detail icon="calendar" label="Date">{formatEventDates(event)}</Detail>
              <Detail icon="clock" label="Time">
                {formatTimeRange(event.startTime, event.endTime)}
                {event.endDate !== event.date && <span className="block text-xs font-normal text-slate-500">Starts day 1, ends on the last day</span>}
              </Detail>
              <Detail icon="pin" label="Venue">{event.venue}</Detail>
              <Detail icon="users" label="Capacity">
                {event.maxParticipants} participants
                <span className="block text-xs font-normal text-slate-500">
                  {event.availableSeats} of {event.maxParticipants} seats available
                </span>
              </Detail>
              <Detail icon="clock" label="Registration deadline">{formatDateTime(event.registrationDeadline)}</Detail>
            </dl>

            {isParticipant ? (
              <RegistrationPanel event={event} registration={registration} onChange={reload} />
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-500">
                Only participants can register. You are viewing this event as {user.role === ROLES.ADMIN ? 'an admin' : 'an organizer'}.
              </p>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
