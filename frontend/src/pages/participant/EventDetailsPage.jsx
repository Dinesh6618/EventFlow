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
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white backdrop-blur">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-white/70">{label}</p>
        <p className="truncate text-sm font-semibold text-white">{children}</p>
      </div>
    </div>
  );
}

function Benefits({ event }) {
  const items = [
    ['award', 'Participation Certificate', 'A numbered certificate anyone can verify online'],
    ['qr', 'Digital event pass', 'A personal QR code for quick check-in'],
    ...(event.teamEnabled ? [['users', 'Team matching', 'Form a team or find teammates by skill']] : []),
    ...(event.prizes?.length ? [['trophy', 'Exciting Prizes', `${event.prizes.length} prize${event.prizes.length === 1 ? '' : 's'} to compete for`]] : []),
  ];
  return (
    <Card className="p-5">
      <h3 className="font-bold text-slate-900">What You&apos;ll Get</h3>
      <ul className="mt-4 space-y-3">
        {items.map(([icon, title, text]) => (
          <li key={title} className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Icon name={icon} className="h-[1.15rem] w-[1.15rem]" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="text-xs text-slate-500">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
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
        action={<Link to="/events" className="font-semibold text-indigo-600">Browse events</Link>}
      />
    );
  }
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { event, registration } = data;
  const isParticipant = user.role === ROLES.PARTICIPANT;
  const hasSeat = isParticipant && registration && HOLDS_SEAT.includes(registration.status);
  const registered = event.maxParticipants - event.availableSeats;

  const tabs = [
    { key: 'about', label: 'About' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'prizes', label: 'Prizes' },
    { key: 'rules', label: 'Rules' },
    { key: 'faqs', label: 'FAQs' },
    ...(event.teamEnabled ? [{ key: 'teams', label: 'Team' }] : []),
    ...(hasSeat ? [{ key: 'updates', label: 'Updates' }] : []),
    ...(hasSeat ? [{ key: 'feedback', label: 'Feedback' }] : []),
    ...(event.teamEnabled && event.leaderboardPublished ? [{ key: 'leaderboard', label: 'Leaderboard' }] : []),
  ];
  const active = tabs.some((t) => t.key === tab) ? tab : 'about';

  return (
    <>
      <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Back
      </button>

      <section className="surface overflow-hidden" aria-label="Event overview">
        <EventBanner event={event} className="h-[30rem] sm:h-80" iconRight>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent" aria-hidden="true" />
          {isParticipant && <FavoriteButton eventId={event.id} initial={event.favorite} className="absolute right-4 top-4" />}
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone="dark">{event.type}</Badge>
              <EventStatusBadge event={event} />
              {event.mode !== 'offline' && <Badge tone="dark">{modeLabel(event.mode)}</Badge>}
              {event.requiresApproval && <Badge tone="amber">Approval required</Badge>}
            </div>
            <h1 className="text-3xl font-extrabold uppercase leading-tight tracking-tight text-white sm:text-4xl">{event.name}</h1>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact icon="calendar" label="Date">{formatEventDates(event)}</Fact>
              <Fact icon="pin" label="Location">{event.venue}</Fact>
              <Fact icon="users" label="Participants">{registered} registered</Fact>
              <Fact icon="clock" label="Duration">{durationText(event)} <span className="font-normal text-white/70">({formatTimeRange(event.startTime, event.endTime)})</span></Fact>
            </div>
          </div>
        </EventBanner>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <Tabs tabs={tabs} value={active} onChange={setTab} label="Event sections" />

          <div className="mt-6" role="tabpanel" aria-label={tabs.find((t) => t.key === active)?.label}>
            {active === 'about' && (
              <div className="space-y-6">
                <section>
                  <h2 className="mb-2 text-xl font-bold text-slate-900">About this event</h2>
                  <p className="whitespace-pre-line leading-relaxed text-slate-600">{event.description}</p>
                  {event.department && (
                    <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3.5 py-2 text-sm font-medium text-indigo-800">
                      <Icon name="book" className="h-4 w-4" />
                      Made for {event.department}
                    </p>
                  )}
                </section>
                <section>
                  <h2 className="mb-3 text-xl font-bold text-slate-900">Organizer</h2>
                  <Card className="grid gap-4 p-5 sm:grid-cols-2">
                    <div className="flex items-center gap-3"><Icon name="user" className="h-5 w-5 text-indigo-400" /><div><p className="text-xs text-slate-500">Name</p><p className="font-semibold text-slate-900">{event.organizerName}</p></div></div>
                    <div className="flex items-center gap-3"><Icon name="mail" className="h-5 w-5 text-indigo-400" /><div className="min-w-0"><p className="text-xs text-slate-500">Contact</p><p className="break-words font-semibold text-slate-900">{event.organizerContact}</p></div></div>
                  </Card>
                </section>
              </div>
            )}
            {active === 'schedule' && (
              <>
                {hasSeat && isHelpWindow(event) && (
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-slate-900 p-4 text-white">
                    <p className="text-sm font-semibold">Something wrong at the event?</p>
                    <GetHelpButton inline eventId={event.id} className="bg-white !text-slate-900 hover:!bg-indigo-50" />
                  </div>
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
                <p className="rounded-2xl bg-slate-100 p-5 text-sm text-slate-600">
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

        <aside className="space-y-5">
          <Card className="space-y-5 p-5 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-slate-900">Registration</h2>
            {isParticipant ? (
              <RegistrationPanel event={event} registration={registration} onChange={reload} />
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-center text-sm text-slate-500">
                Only students can register. You are viewing this event as {user.role === ROLES.ADMIN ? 'an admin' : 'an organizer'}.
              </p>
            )}
          </Card>
          <Benefits event={event} />
        </aside>
      </div>
    </>
  );
}
