import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, registrationsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadIcs } from '../../utils/calendar.js';
import { formatDate, formatDateTime, formatEventDates } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button, { buttonClasses } from '../ui/Button.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import Icon from '../ui/Icon.jsx';

const ACTIVE = ['pending', 'approved', 'confirmed'];

const STATUS_NOTE = {
  pending: 'The organizer needs to approve your registration. Your seat is held in the meantime.',
  approved: 'The organizer approved your registration. See you there!',
  confirmed: 'Your seat is confirmed. See you there!',
  rejected: 'The organizer declined this registration.',
  cancelled: 'You cancelled this registration. You can register again while seats and registration remain open.',
};

/** Seats left, as a slim indigo progress bar. */
export function SeatsMeter({ event }) {
  const filled = event.maxParticipants - event.availableSeats;
  const pct = Math.min(100, Math.round((filled / event.maxParticipants) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-slate-900">
          {event.availableSeats === 0 ? 'No seats left' : `${event.availableSeats} ${event.availableSeats === 1 ? 'seat' : 'seats'} left`}
        </span>
        <span className="text-slate-500">{filled} / {event.maxParticipants} registered</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={event.maxParticipants} aria-label="Seats filled">
        <div className="h-full rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Detail({ label, children, mono = false }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/**
 * The "Register Now" card on the event page. New registrations go through the registration form;
 * people who already hold a seat see "You're registered!", their pass and the cancel button here.
 */
export default function RegistrationPanel({ event, registration, onChange }) {
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);

  const isActive = registration && ACTIVE.includes(registration.status);
  const canRegister = event.registrationOpen && event.availableSeats > 0 && registration?.status !== 'rejected' && !isActive;
  const blockedReason =
    registration?.status === 'rejected'
      ? null
      : event.status === 'ended'
        ? 'This event has ended.'
        : !event.registrationOpen
          ? 'Registration has closed.'
          : 'This event is full.';

  const title = isActive ? (registration.status === 'pending' ? 'Registration pending' : "You're registered!") : 'Registration';

  const cancel = async () => {
    setBusy(true);
    try {
      await registrationsApi.cancel(registration.id);
      toast.success('Your registration was cancelled.');
      onChange(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      onChange(null);
    } finally {
      setBusy(false);
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

      <SeatsMeter event={event} />

      {!isActive && (
        <div className="flex items-start gap-2 text-sm text-slate-600">
          <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Registration closes
            <span className="block font-medium text-slate-900">{formatDateTime(event.registrationDeadline)}</span>
          </p>
        </div>
      )}

      {registration && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Your registration</span>
            <RegistrationStatusBadge status={registration.status} />
          </div>
          <p className="mt-2 text-slate-600">{STATUS_NOTE[registration.status]}</p>
          {isActive && (
            <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3">
              <Detail label="Registration ID" mono>{registration.participantCode}</Detail>
              <Detail label="Date">{formatEventDates(event)}</Detail>
              <Detail label="Venue">{event.venue}</Detail>
              <Detail label="Registered on">{formatDate(registration.registeredAt.slice(0, 10))}</Detail>
            </dl>
          )}
        </div>
      )}

      {isActive ? (
        <div className="space-y-2">
          <Link to={`/my/registrations/${registration.id}/pass`} className={buttonClasses('primary', 'lg', 'w-full')}>
            <Icon name="qr" className="h-5 w-5" />
            View QR Pass
          </Link>
          <Button variant="secondary" className="w-full" onClick={() => downloadIcs(event)}>
            <Icon name="calendar" className="h-4 w-4" />
            Add to Calendar
          </Button>
          {event.status === 'upcoming' && (
            <Button variant="ghost" className="w-full text-red-600 hover:bg-red-50" onClick={() => setCancelling(true)}>
              Cancel registration
            </Button>
          )}
        </div>
      ) : canRegister ? (
        <Link to={`/events/${event.id}/register`} className={buttonClasses('primary', 'lg', 'w-full')}>
          {registration?.status === 'cancelled' ? 'Register again' : 'Register Now'}
        </Link>
      ) : (
        blockedReason && <Alert type="info">{blockedReason}</Alert>
      )}

      <ConfirmDialog
        open={cancelling}
        title="Cancel your registration?"
        confirmLabel="Yes, cancel registration"
        cancelLabel="Keep registration"
        danger
        loading={busy}
        onCancel={() => setCancelling(false)}
        onConfirm={cancel}
      >
        <p>
          Your seat for <strong className="text-slate-900">{event.name}</strong> will be released for other participants.
        </p>
      </ConfirmDialog>
    </div>
  );
}
