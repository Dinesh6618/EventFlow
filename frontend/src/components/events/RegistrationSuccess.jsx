import { Link } from 'react-router-dom';
import { downloadIcs } from '../../utils/calendar.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import Button, { buttonClasses } from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

/** Shown right after a successful registration. `teamNote` explains a team that could not be created. */
export default function RegistrationSuccess({ event, registration, teamName, teamNote }) {
  const pending = registration.status === 'pending';
  return (
    <div className="mx-auto max-w-lg text-center" data-testid="registration-success">
      <div className="mx-auto flex h-24 w-24 animate-check items-center justify-center rounded-full bg-emerald-500 text-white shadow-xl shadow-emerald-500/30 scan-success">
        <svg viewBox="0 0 24 24" className="check-draw h-12 w-12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{pending ? 'Request sent!' : "You're Registered!"}</h1>
      <p className="mt-2 text-slate-500">
        {pending ? 'The organizer will review your registration. Your seat is held in the meantime.' : 'Your seat is saved and your event pass is ready.'}
      </p>

      <Card className="mt-8 p-6 text-left">
        <h2 className="text-lg font-bold text-slate-900">{event.name}</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center gap-3"><Icon name="ticket" className="h-4 w-4 text-indigo-400" /><dt className="w-28 text-slate-500">Participant ID</dt><dd className="font-mono font-bold text-slate-900">{registration.participantCode}</dd></div>
          <div className="flex items-start gap-3"><Icon name="calendar" className="mt-0.5 h-4 w-4 text-indigo-400" /><dt className="w-28 shrink-0 text-slate-500">Date</dt><dd className="font-semibold text-slate-900">{formatEventDates(event)}<span className="block font-normal text-slate-500">{formatTimeRange(event.startTime, event.endTime)}</span></dd></div>
          <div className="flex items-start gap-3"><Icon name="pin" className="mt-0.5 h-4 w-4 text-indigo-400" /><dt className="w-28 shrink-0 text-slate-500">Location</dt><dd className="font-semibold text-slate-900">{event.venue}</dd></div>
          {teamName && !teamNote && <div className="flex items-center gap-3"><Icon name="users" className="h-4 w-4 text-indigo-400" /><dt className="w-28 text-slate-500">Team</dt><dd className="font-semibold text-slate-900">{teamName}</dd></div>}
        </dl>
      </Card>

      {teamNote && <Alert type="info" className="mt-4 text-left">{teamNote}</Alert>}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link to={`/my/registrations/${registration.id}/pass`} className={buttonClasses('primary', 'lg')}>
          <Icon name="qr" className="h-5 w-5" />
          View Event Pass
        </Link>
        <Button variant="secondary" size="lg" onClick={() => downloadIcs(event)}>
          <Icon name="calendar" className="h-5 w-5" />
          Add to Calendar
        </Button>
      </div>
      <Link to={`/events/${event.id}`} className="mt-6 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">Back to the event</Link>
    </div>
  );
}
