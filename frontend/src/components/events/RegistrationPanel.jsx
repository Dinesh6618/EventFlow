import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, registrationsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { formatDate } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';

const ACTIVE = ['pending', 'approved', 'confirmed'];

const STATUS_NOTE = {
  pending: 'The organizer needs to approve your registration. Your seat is held in the meantime.',
  approved: 'The organizer approved your registration. See you there!',
  confirmed: 'Your seat is confirmed. See you there!',
  rejected: 'The organizer declined this registration.',
  cancelled: 'You cancelled this registration. You can register again while seats and registration remain open.',
};

/**
 * Participant-side registration controls for the event details page.
 * `registration` is the participant's own row (or null); `onChange` receives the refreshed data.
 */
export default function RegistrationPanel({ event, registration, onChange }) {
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // 'register' | 'cancel' | null
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

  const run = async (action, successMessage) => {
    setBusy(true);
    try {
      const result = await action();
      onChange(result);
      toast.success(successMessage(result));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
      // The event may have filled up or closed since the page loaded.
      onChange(null);
    } finally {
      setBusy(false);
      setDialog(null);
    }
  };

  return (
    <div className="space-y-4">
      {registration && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-slate-900">Your registration</span>
            <RegistrationStatusBadge status={registration.status} />
          </div>
          <p className="mt-2 text-slate-600">{STATUS_NOTE[registration.status]}</p>
          {isActive && (
            <p className="mt-3 text-xs text-slate-500">
              Participant ID <span className="font-mono text-sm font-semibold text-slate-900">{registration.participantCode}</span>
              <br />
              Registered {formatDate(registration.registeredAt.slice(0, 10))}
            </p>
          )}
        </div>
      )}

      {isActive ? (
        <>
          <Link to="/my/registrations" className="block text-center text-sm font-medium text-indigo-600 hover:text-indigo-700">
            View all my registrations
          </Link>
          {event.status === 'upcoming' && (
            <Button variant="secondary" className="w-full" onClick={() => setDialog('cancel')}>
              Cancel registration
            </Button>
          )}
        </>
      ) : canRegister ? (
        <Button size="lg" className="w-full" onClick={() => setDialog('register')}>
          {registration?.status === 'cancelled' ? 'Register again' : 'Register'}
        </Button>
      ) : (
        blockedReason && <Alert type="info">{blockedReason}</Alert>
      )}

      <ConfirmDialog
        open={dialog === 'register'}
        title="Register for this event?"
        confirmLabel="Confirm registration"
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() =>
          run(
            () => registrationsApi.register(event.id),
            (r) => (r.registration.status === 'pending' ? 'Registration submitted. Waiting for organizer approval.' : 'You are registered!'),
          )
        }
      >
        <p>
          You are about to register for <strong className="text-slate-900">{event.name}</strong> on {formatDate(event.date)} at {event.venue}.
        </p>
        {event.requiresApproval && <p className="mt-2">The organizer reviews registrations for this event, so yours will start as pending.</p>}
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel your registration?"
        confirmLabel="Yes, cancel registration"
        cancelLabel="Keep registration"
        danger
        loading={busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => run(() => registrationsApi.cancel(registration.id), () => 'Your registration was cancelled.')}
      >
        <p>
          Your seat for <strong className="text-slate-900">{event.name}</strong> will be released for other participants.
        </p>
      </ConfirmDialog>
    </div>
  );
}
