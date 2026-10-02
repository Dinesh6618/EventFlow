import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { eventsApi } from '../../api';
import EventBanner from '../../components/events/EventBanner.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge, { EventStatusBadge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { ROLES, homePathFor } from '../../utils/constants.js';
import { formatDate, formatDateTime, formatTimeRange } from '../../utils/format.js';

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

  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Opened in a fresh tab there is nothing to go back to, so fall back to the user's home.
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate(homePathFor(user.role)));

  if (loading) return <PageLoader label="Loading event..." />;
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

  const { event } = data;
  const isParticipant = user.role === ROLES.PARTICIPANT;
  const full = event.availableSeats === 0;
  const canRegister = event.registrationOpen && !full;
  const blockedReason = event.status === 'ended' ? 'This event has ended.' : full ? 'This event is full.' : 'Registration has closed.';

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
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{event.name}</h1>

          <h2 className="mb-2 mt-8 text-lg font-semibold text-slate-900">About this event</h2>
          <p className="whitespace-pre-line text-slate-600">{event.description}</p>

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
              <Detail icon="calendar" label="Date">{formatDate(event.date)}</Detail>
              <Detail icon="clock" label="Time">{formatTimeRange(event.startTime, event.endTime)}</Detail>
              <Detail icon="pin" label="Venue">{event.venue}</Detail>
              <Detail icon="users" label="Capacity">
                {event.maxParticipants} participants ({event.availableSeats} seats available)
              </Detail>
              <Detail icon="clock" label="Registration deadline">{formatDateTime(event.registrationDeadline)}</Detail>
            </dl>

            {confirmed ? (
              <Alert type="success">
                Thanks for your interest in <strong>{event.name}</strong>! Your registration has been noted. Full registration is coming soon.
              </Alert>
            ) : isParticipant ? (
              <>
                <Button size="lg" className="w-full" disabled={!canRegister} onClick={() => setConfirming(true)}>
                  Register
                </Button>
                {!canRegister && <p className="text-center text-sm text-slate-500">{blockedReason}</p>}
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-center text-sm text-slate-500">
                Only participants can register. You are viewing this event as {user.role === ROLES.ADMIN ? 'an admin' : 'an organizer'}.
              </p>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Register for this event?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setConfirming(false);
                setConfirmed(true);
              }}
            >
              Confirm registration
            </Button>
          </>
        }
      >
        <p>
          You are about to register for <strong className="text-slate-900">{event.name}</strong> on {formatDate(event.date)} at {event.venue}.
        </p>
      </Modal>
    </>
  );
}
