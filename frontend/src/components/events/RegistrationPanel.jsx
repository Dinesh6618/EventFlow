import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, registrationsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadIcs } from '../../utils/calendar.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
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

/** Seats filled, as a labelled progress bar. */
export function SeatsMeter({ event }) {
  const filled = event.maxParticipants - event.availableSeats;
  const pct = Math.min(100, Math.round((filled / event.maxParticipants) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-slate-900">{filled} / {event.maxParticipants} seats filled</span>
        <span className="text-slate-500">{pct}%</span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={filled} aria-valuemin={0} aria-valuemax={event.maxParticipants} aria-label="Seats filled">
        <div className="progress-grow h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * Registration card on the event page. New registrations go through the registration form;
 * people who already hold a seat see their status, pass and cancel button here.
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
      <SeatsMeter event={event} />
      <div className="flex items-start gap-2.5 text-sm text-slate-600">
        <Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        <p>
          Registration closes
          <span className="block font-semibold text-slate-900">{formatDateTime(event.registrationDeadline)}</span>
        </p>
      </div>

      {registration && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-900">Your registration</span>
            <RegistrationStatusBadge status={registration.status} />
          </div>
          <p className="mt-2 text-slate-600">{STATUS_NOTE[registration.status]}</p>
          {isActive && (
            <p className="mt-3 text-xs text-slate-500">
              Participant ID <span className="font-mono text-sm font-bold text-slate-900">{registration.participantCode}</span>
              <br />
              Registered {formatDate(registration.registeredAt.slice(0, 10))}
            </p>
          )}
        </div>
      )}

      {isActive ? (
        <>
          <Link to={`/my/registrations/${registration.id}/pass`} className={buttonClasses('primary', 'lg', 'w-full')}>
            <Icon name="qr" className="h-5 w-5" />
            View Event Pass
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
        </>
      ) : canRegister ? (
        <Link to={`/events/${event.id}/register`} className={buttonClasses('primary', 'lg', 'w-full uppercase tracking-wide')}>
          {registration?.status === 'cancelled' ? 'Register again' : 'Register now'}
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
