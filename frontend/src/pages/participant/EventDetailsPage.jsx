import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventsApi } from '../../api';
import AnnouncementsFeed from '../../components/events/AnnouncementsFeed.jsx';
import EventBanner from '../../components/events/EventBanner.jsx';
import { FaqsPanel, PrizesPanel, RulesPanel } from '../../components/events/EventInfoPanels.jsx';
import RegistrationPanel from '../../components/events/RegistrationPanel.jsx';
import FeedbackPanel from '../../components/feedback/FeedbackPanel.jsx';
import GetHelpButton from '../../components/help/GetHelpButton.jsx';
import LeaderboardPanel from '../../components/judging/LeaderboardPanel.jsx';
import SchedulePanel from '../../components/schedule/SchedulePanel.jsx';
import TeamsPanel from '../../components/teams/TeamsPanel.jsx';
import Badge, { EventStatusBadge } from '../../components/ui/Badge.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import FavoriteButton from '../../components/ui/FavoriteButton.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLES, homePathFor, modeLabel } from '../../utils/constants.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import { isHelpWindow } from '../../utils/help.js';

const HOLDS_SEAT = ['pending', 'approved', 'confirmed'];

/** '6 hours', '2 days' - how long the event runs. */
function durationText(event) {
  const days = Math.round((new Date(`${event.endDate}T00:00:00`) - new Date(`${event.date}T00:00:00`)) / 86400000) + 1;
  if (days > 1) return `${days} days`;
  const [sh, sm] = event.startTime.split(':').map(Number);
  const [eh, em] = event.endTime.split(':').map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${Math.floor(hours)}h ${minutes % 60}m`;
}

function Fact({ icon, label, children }) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-sm text-slate-500">{label}</dt>
        <dd className="break-words text-sm font-medium text-slate-900">{children}</dd>
      </div>
    </div>
  );
}

export default function EventDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('about');
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
  const hasSeat = isParticipant && registration && HOLDS_SEAT.includes(registration.status);

  const tabs = [
    { key: 'about', label: 'About' },
    { key: 'rules', label: 'Rules' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'prizes', label: 'Prizes' },
    { key: 'faqs', label: 'FAQs' },
    ...(event.teamEnabled ? [{ key: 'teams', label: 'Team' }] : []),
    ...(hasSeat ? [{ key: 'updates', label: 'Updates' }] : []),
    ...(hasSeat ? [{ key: 'feedback', label: 'Feedback' }] : []),
    ...(event.teamEnabled && event.leaderboardPublished ? [{ key: 'leaderboard', label: 'Leaderboard' }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'about';

  return (
    <>
      <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Back
      </button>

      {/* On phones the register card comes right after the facts; on desktop it sits in the right column. */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="overflow-hidden lg:col-start-1" aria-label="Event overview">
          <EventBanner event={event} className="h-52 sm:h-72">
            {isParticipant && <FavoriteButton eventId={event.id} initial={event.favorite} className="absolute right-3 top-3" />}
          </EventBanner>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="indigo">{event.type}</Badge>
              <EventStatusBadge event={event} />
              {event.mode !== 'offline' && <Badge tone="slate">{modeLabel(event.mode)}</Badge>}
              {event.requiresApproval && <Badge tone="amber">Approval required</Badge>}
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-900">{event.name}</h1>
            <dl className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <Fact icon="calendar" label="Date">{formatEventDates(event)}</Fact>
              <Fact icon="clock" label="Time">
                {formatTimeRange(event.startTime, event.endTime)} <span className="font-normal text-slate-500">({durationText(event)})</span>
              </Fact>
              <Fact icon="pin" label="Venue">{event.venue}</Fact>
              <Fact icon="user" label="Organizer">
                {event.organizerName}
                {event.organizerContact && <span className="block font-normal text-slate-500">{event.organizerContact}</span>}
              </Fact>
              {event.department && <Fact icon="book" label="Made for">{event.department}</Fact>}
            </dl>
          </div>
        </Card>

        <aside className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <Card className="p-5 lg:sticky lg:top-20">
            {isParticipant ? (
              <RegistrationPanel event={event} registration={registration} onChange={reload} />
            ) : (
              <>
                <h2 className="text-lg font-semibold text-slate-900">Registration</h2>
                <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  Only students can register. You are viewing this event as {user.role === ROLES.ADMIN ? 'an admin' : 'an organizer'}.
                </p>
              </>
            )}
          </Card>
        </aside>

        <div className="min-w-0 lg:col-start-1">
          <Tabs variant="underline" tabs={tabs} value={active} onChange={setTab} label="Event sections" />

          <div className="mt-5" role="tabpanel" aria-label={tabs.find((t) => t.key === active)?.label}>
            {active === 'about' && (
              <section>
                <h2 className="mb-2 text-lg font-semibold text-slate-900">About this event</h2>
                <Card className="p-5">
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">{event.description}</p>
                </Card>
              </section>
            )}
            {active === 'schedule' && (
              <>
                {hasSeat && isHelpWindow(event) && (
                  <Card className="mb-4 flex items-center justify-between gap-3 p-4">
                    <p className="text-sm font-medium text-slate-900">Something wrong at the event?</p>
                    <GetHelpButton inline eventId={event.id} />
                  </Card>
                )}
                <SchedulePanel eventId={event.id} />
              </>
            )}
            {active === 'prizes' && <PrizesPanel prizes={event.prizes} />}
            {active === 'rules' && <RulesPanel rules={event.rules} />}
            {active === 'faqs' && <FaqsPanel faqs={event.faqs} />}
            {active === 'teams' &&
              (hasSeat ? (
                <TeamsPanel event={event} />
              ) : (
                <p className="surface p-4 text-sm text-slate-600">
                  {isParticipant ? 'Register for this event to create or join a team.' : 'Participants who register can create and join teams here.'}
                </p>
              ))}
            {active === 'updates' && (
              <>
                <AnnouncementsFeed eventId={event.id} />
                <p className="text-sm text-slate-500">Announcements from the organizer appear here as soon as they are sent.</p>
              </>
            )}
            {active === 'feedback' && <FeedbackPanel event={event} />}
            {active === 'leaderboard' && <LeaderboardPanel eventId={event.id} />}
          </div>
        </div>
      </div>
    </>
  );
}
