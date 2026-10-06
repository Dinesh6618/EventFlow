import { Link } from 'react-router-dom';
import { registrationsApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { downloadIcs } from '../../utils/calendar.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import { useQrDataUrl } from '../attendance/QRPass.jsx';
import Alert from '../ui/Alert.jsx';
import Button, { buttonClasses } from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import Spinner from '../ui/Spinner.jsx';

function Row({ label, children, mono = false }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
      <dd className={`min-w-0 break-words font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{children}</dd>
    </div>
  );
}

/** The registration's QR, drawn from the student's own registration list (the register call does not return the token). */
function PassQr({ registration, pending }) {
  const { data, error } = useApi((signal) => registrationsApi.mine(signal), [registration.id]);
  const token = data?.registrations.find((r) => r.id === registration.id)?.qrToken;
  const qr = useQrDataUrl(token, 240);

  if (pending) {
    return <p className="text-center text-sm text-slate-500">Your QR pass appears once the organizer approves your registration.</p>;
  }
  return (
    <div className="flex justify-center">
      <div className="flex h-44 w-44 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
        {qr.src ? (
          <img src={qr.src} alt="Check-in QR code" className="h-full w-full" />
        ) : qr.failed || error || (data && !token) ? (
          <p className="px-2 text-center text-xs text-slate-500">Open your event pass to see the QR code.</p>
        ) : (
          <Spinner className="h-6 w-6 text-indigo-600" />
        )}
      </div>
    </div>
  );
}

/** Shown right after a successful registration. `teamNote` explains a team that could not be created. */
export default function RegistrationSuccess({ event, registration, teamName, teamNote }) {
  const pending = registration.status === 'pending';
  return (
    <div className="mx-auto max-w-lg text-center" data-testid="registration-success">
      <div className="mx-auto flex h-14 w-14 animate-check items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
        <Icon name="check" className="h-7 w-7" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">{pending ? 'Request sent!' : "You're registered!"}</h1>
      <p className="mt-1 text-sm text-slate-500 sm:text-base">
        {pending ? 'The organizer will review your registration. Your seat is held in the meantime.' : 'Your seat is saved and your event pass is ready.'}
      </p>

      <Card className="mt-6 p-5 text-left">
        <h2 className="text-base font-semibold text-slate-900">{event.name}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <Row label="Registration ID" mono>{registration.participantCode}</Row>
          <Row label="Date">{formatEventDates(event)}</Row>
          <Row label="Time">{formatTimeRange(event.startTime, event.endTime)}</Row>
          <Row label="Venue">{event.venue}</Row>
          {teamName && !teamNote && <Row label="Team">{teamName}</Row>}
        </dl>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <PassQr registration={registration} pending={pending} />
        </div>
      </Card>

      {teamNote && <Alert type="info" className="mt-4 text-left">{teamNote}</Alert>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link to={`/my/registrations/${registration.id}/pass`} className={buttonClasses('primary', 'lg')}>
          <Icon name="qr" className="h-5 w-5" />
          View Event Pass
        </Link>
        <Button variant="secondary" size="lg" onClick={() => downloadIcs(event)}>
          <Icon name="calendar" className="h-5 w-5" />
          Add to Calendar
        </Button>
      </div>
      <Link to={`/events/${event.id}`} className="mt-5 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700">Back to the event</Link>
    </div>
  );
}
