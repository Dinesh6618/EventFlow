import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, registrationsApi, scheduleApi } from '../../api';
import { AttendanceBadge } from '../../components/attendance/AttendanceSummary.jsx';
import QrCodeModal from '../../components/attendance/QrCodeModal.jsx';
import Badge, { RegistrationStatusBadge } from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import { SessionTypeBadge } from '../../components/schedule/ScheduleList.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';

const ACTIVE = ['pending', 'approved', 'confirmed'];

function RegistrationCard({ registration: r, onCancel, onShowQr }) {
  const canCancel = ACTIVE.includes(r.status) && r.eventStatus === 'upcoming';
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/events/${r.eventId}`} className="text-lg font-semibold text-slate-900 hover:text-indigo-700">
            {r.eventName}
          </Link>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge tone="indigo">{r.eventType}</Badge>
            <RegistrationStatusBadge status={r.status} />
            {r.eventStatus === 'ended' && <Badge tone="slate">Event ended</Badge>}
            {r.eventStatus === 'ongoing' && <Badge tone="green">Happening now</Badge>}
            {r.attendanceStatus && <AttendanceBadge state={r.attendanceStatus} />}
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          Participant ID
          <p className="font-mono text-sm font-semibold text-slate-900">{r.participantCode}</p>
        </div>
      </div>

      <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
        <li className="flex items-center gap-2"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })}</li>
        <li className="flex items-center gap-2"><Icon name="clock" className="h-4 w-4 text-slate-400" />{formatTimeRange(r.eventStartTime, r.eventEndTime)}</li>
        <li className="flex items-center gap-2"><Icon name="pin" className="h-4 w-4 text-slate-400" />{r.eventVenue}</li>
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        {r.qrToken && r.eventStatus !== 'ended' && (
          <Button size="sm" onClick={() => onShowQr(r)}>Show QR code</Button>
        )}
        <Link to={`/events/${r.eventId}`} className={buttonClasses('secondary', 'sm')}>View details</Link>
        {canCancel && (
          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => onCancel(r)}>
            Cancel registration
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function MyRegistrationsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => registrationsApi.mine(signal));
  const today = useApi((signal) => scheduleApi.myToday(signal), [], { refreshMs: 60000 });
  const [tab, setTab] = useState('current');
  const [target, setTarget] = useState(null);
  const [qr, setQr] = useState(null);
  const [busy, setBusy] = useState(false);

  const all = data?.registrations ?? [];
  // History = events that are over, or registrations that no longer hold a seat.
  const isHistory = (r) => r.eventStatus === 'ended' || !ACTIVE.includes(r.status);
  const current = all.filter((r) => !isHistory(r)).reverse(); // soonest first
  const history = all.filter(isHistory);
  const shown = tab === 'current' ? current : history;

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
      <PageHeader title="My registrations" description="Events you have registered for and your event history." />

      {today.data?.items.length > 0 && (
        <section aria-label="Today's schedule" className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <h2 className="text-sm font-semibold text-indigo-900">Today's schedule</h2>
          <ul className="mt-2 divide-y divide-indigo-100">
            {today.data.items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-slate-900">{s.startTime} {s.title}</span>
                  <span className="block text-xs text-slate-500">{s.eventName}{s.venue ? ` - ${s.venue}` : ''}</span>
                </span>
                <span className="flex items-center gap-2">
                  {s.status === 'ongoing' && <span className="text-xs font-medium text-emerald-700">Happening now</span>}
                  <SessionTypeBadge type={s.sessionType} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div role="tablist" aria-label="Registrations" className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {[
          ['current', `Upcoming & active (${current.length})`],
          ['history', `History (${history.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${tab === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {!data && loading ? (
        <PageLoader label="Loading your registrations..." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="calendar"
          title={tab === 'current' ? 'No upcoming registrations' : 'No event history yet'}
          description={tab === 'current' ? 'Browse events and register to see them here.' : 'Past, cancelled and declined registrations will show up here.'}
          action={tab === 'current' && <Link to="/events" className={buttonClasses('primary')}>Browse events</Link>}
        />
      ) : (
        <ul className="space-y-4">
          {shown.map((r) => (
            <li key={r.id}>
              <RegistrationCard registration={r} onCancel={setTarget} onShowQr={setQr} />
            </li>
          ))}
        </ul>
      )}

      <QrCodeModal registration={qr} onClose={() => setQr(null)} />

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
