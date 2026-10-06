import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, registrationsApi } from '../../api';
import { AttendanceBadge } from '../../components/attendance/AttendanceSummary.jsx';
import EventBanner from '../../components/events/EventBanner.jsx';
import GetHelpButton from '../../components/help/GetHelpButton.jsx';
import Badge, { RegistrationStatusBadge } from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import { isHelpWindow } from '../../utils/help.js';

const ACTIVE = ['pending', 'approved', 'confirmed'];

function EventRow({ registration: r, onCancel }) {
  const active = ACTIVE.includes(r.status);
  const canCancel = active && r.eventStatus === 'upcoming';
  const banner = { name: r.eventName, type: r.eventType, image: r.eventImage };

  return (
    <Card hover className="overflow-hidden sm:grid sm:grid-cols-[13rem_minmax(0,1fr)]" data-testid="my-event">
      <EventBanner event={banner} className="h-40 sm:h-full" />
      <div className="flex flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="indigo">{r.eventType}</Badge>
          <RegistrationStatusBadge status={r.status} />
          {r.eventStatus === 'ongoing' && <Badge tone="green">Happening now</Badge>}
          {r.attendanceStatus && <AttendanceBadge state={r.attendanceStatus} />}
        </div>
        <Link to={`/events/${r.eventId}`} className="mt-2.5 text-lg font-bold text-slate-900 hover:text-indigo-700">{r.eventName}</Link>
        <ul className="mt-2 grid gap-1.5 text-sm text-slate-600 sm:grid-cols-2">
          <li className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-indigo-400" />{formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })}</li>
          <li className="flex items-center gap-2"><Icon name="clock" className="h-4 w-4 text-indigo-400" />{formatTimeRange(r.eventStartTime, r.eventEndTime)}</li>
          <li className="flex items-center gap-2 sm:col-span-2"><Icon name="pin" className="h-4 w-4 text-indigo-400" />{r.eventVenue}</li>
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          {active && r.eventStatus !== 'ended' && (
            <Link to={`/my/registrations/${r.id}/pass`} className={buttonClasses('primary', 'sm')}>
              <Icon name="qr" className="h-4 w-4" />
              Event Pass
            </Link>
          )}
          <Link to={`/events/${r.eventId}`} className={buttonClasses('secondary', 'sm')}>View Event</Link>
          {active && isHelpWindow({ status: r.eventStatus, date: r.eventDate, endDate: r.eventEndDate }) && <GetHelpButton inline eventId={r.eventId} />}
          {active && r.eventStatus === 'ended' && (
            <Link to={`/events/${r.eventId}/feedback`} className={buttonClasses('secondary', 'sm')}>
              <Icon name="message" className="h-4 w-4" />
              Give feedback
            </Link>
          )}
          {canCancel && (
            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => onCancel(r)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

const EMPTY = {
  upcoming: ['ticket', 'No upcoming events', 'Browse events and register to see them here.'],
  past: ['calendar', 'No past events yet', 'Events you attended will be listed here, with a link to give feedback.'],
  cancelled: ['x', 'Nothing cancelled', 'Registrations you cancel, or that the organizer declines, show up here.'],
};

export default function MyEventsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => registrationsApi.mine(signal));
  const [tab, setTab] = useState('upcoming');
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = data?.registrations ?? [];
  const groups = {
    upcoming: all.filter((r) => ACTIVE.includes(r.status) && r.eventStatus !== 'ended').reverse(), // soonest first
    past: all.filter((r) => ACTIVE.includes(r.status) && r.eventStatus === 'ended'),
    cancelled: all.filter((r) => !ACTIVE.includes(r.status)),
  };
  const shown = groups[tab];

  const confirmCancel = async () => {
    setBusy(true);
    try {
      await registrationsApi.cancel(target.id);
      toast.success(`Registration for "${target.eventName}" cancelled.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel the registration.');
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="My Events" title="Your events" description="Passes, status and history for every event you registered for." />

      <Tabs
        label="My events"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'upcoming', label: 'Upcoming', count: groups.upcoming.length },
          { key: 'past', label: 'Past', count: groups.past.length },
          { key: 'cancelled', label: 'Cancelled', count: groups.cancelled.length },
        ]}
      />

      <div className="mt-6">
        {!data && loading ? (
          <PageLoader label="Loading your events..." />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : shown.length === 0 ? (
          <EmptyState
            icon={EMPTY[tab][0]}
            title={EMPTY[tab][1]}
            description={EMPTY[tab][2]}
            action={tab === 'upcoming' && <Link to="/events" className={buttonClasses('primary')}>Explore Events</Link>}
          />
        ) : (
          <ul className="space-y-5">
            {shown.map((r) => (
              <li key={r.id}><EventRow registration={r} onCancel={setTarget} /></li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(target)}
        title="Cancel your registration?"
        confirmLabel="Yes, cancel registration"
        cancelLabel="Keep registration"
        danger
        loading={busy}
        onCancel={() => setTarget(null)}
        onConfirm={confirmCancel}
      >
        <p>
          Your seat for <strong className="text-slate-900">{target?.eventName}</strong> will be released for other participants.
        </p>
      </ConfirmDialog>
    </>
  );
}
