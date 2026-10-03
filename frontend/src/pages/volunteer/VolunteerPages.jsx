import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, meApi, volunteerApi } from '../../api';
import ScanPanel from '../../components/attendance/ScanPanel.jsx';
import { ZoneReporter } from '../../components/insights/ZonePanel.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Textarea } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import Modal from '../../components/ui/Modal.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate, formatTimeRange } from '../../utils/format.js';

const STATUS = {
  pending: ['amber', 'Application pending'],
  approved: ['green', 'Approved'],
  declined: ['red', 'Not accepted'],
};
const when = (o) => (o.endDate !== o.date ? `${formatDate(o.date)} - ${formatDate(o.endDate)}` : `${formatDate(o.date)}, ${formatTimeRange(o.startTime, o.endTime)}`);

/** One open event: apply, see the answer, or withdraw. */
function Opportunity({ item, onApply, onWithdraw, busy }) {
  const status = item.isVolunteer ? 'approved' : item.applicationStatus;
  const [tone, label] = STATUS[status] ?? [];
  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="indigo">{item.type}</Badge>
        {label && <Badge tone={tone}>{label}</Badge>}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-slate-900">{item.eventName}</h3>
      {item.college && <p className="text-sm text-slate-500">{item.college}</p>}
      <p className="mt-2 flex items-center gap-2 text-sm text-slate-600"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{when(item)}</p>
      <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="pin" className="h-4 w-4 text-slate-400" />{item.venue}</p>
      <div className="mt-auto pt-4">
        {item.isVolunteer ? (
          <Link to={`/volunteer/events/${item.eventId}`} className={buttonClasses('primary', 'md', 'w-full')}>Open check-in</Link>
        ) : status === 'pending' ? (
          <Button variant="secondary" className="w-full" loading={busy} onClick={() => onWithdraw(item)}>Withdraw application</Button>
        ) : (
          <Button className="w-full" onClick={() => onApply(item)}>{status === 'declined' ? 'Apply again' : 'Apply to volunteer'}</Button>
        )}
      </div>
    </Card>
  );
}

/** The volunteer area: events I help at, and events I can apply to. */
export function VolunteerHome() {
  const toast = useToast();
  const assignments = useApi((signal) => meApi.assignments(signal));
  const opportunities = useApi((signal) => volunteerApi.opportunities(signal));
  const mine = assignments.data?.assignments.filter((a) => a.staffRole === 'volunteer') ?? [];
  const [applying, setApplying] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null);

  const refresh = () => {
    assignments.reload();
    opportunities.reload();
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy('apply');
    try {
      await volunteerApi.apply(applying.eventId, message.trim());
      toast.success(`Application sent for ${applying.eventName}. The organizer will review it.`);
      setApplying(null);
      setMessage('');
      refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send your application.');
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (item) => {
    setBusy(item.eventId);
    try {
      await volunteerApi.withdraw(item.eventId);
      toast.success('Application withdrawn.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const open = opportunities.data?.opportunities.filter((o) => !o.isVolunteer) ?? [];

  return (
    <>
      <PageHeader eyebrow="Volunteer" title="Volunteer platform" description="Help run campus events: scan QR passes at the door and report crowd levels. Apply below and the organizer will approve you." />

      <section aria-labelledby="my-volunteering" className="mb-10">
        <h2 id="my-volunteering" className="mb-3 text-xl font-bold text-slate-900">Events I volunteer at</h2>
        {!assignments.data && assignments.loading ? (
          <PageLoader />
        ) : assignments.error ? (
          <LoadError error={assignments.error} onRetry={assignments.reload} />
        ) : mine.length === 0 ? (
          <EmptyState icon="users" title="No volunteer assignments yet" description="Apply to an event below, or wait for an organizer to add you. Approved events appear here." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {mine.map((a) => (
              <li key={a.eventId}>
                <Card className="p-5">
                  <Badge tone="green">Volunteer</Badge>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{a.eventName}</h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{formatDate(a.date)}, {formatTimeRange(a.startTime, a.endTime)}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="pin" className="h-4 w-4 text-slate-400" />{a.venue}</p>
                  <Link to={`/volunteer/events/${a.eventId}`} className={buttonClasses('primary', 'md', 'mt-4 w-full')}>Open check-in</Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="open-events">
        <h2 id="open-events" className="mb-3 text-xl font-bold text-slate-900">Events looking for volunteers</h2>
        {!opportunities.data && opportunities.loading ? (
          <PageLoader />
        ) : opportunities.error ? (
          <LoadError error={opportunities.error} onRetry={opportunities.reload} />
        ) : open.length === 0 ? (
          <EmptyState icon="calendar" title="No upcoming events right now" description="New events will show up here as organizers publish them." />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {open.map((o) => (
              <li key={o.eventId}><Opportunity item={o} busy={busy === o.eventId} onApply={(item) => { setMessage(''); setApplying(item); }} onWithdraw={withdraw} /></li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={Boolean(applying)} onClose={() => setApplying(null)} title={`Volunteer at ${applying?.eventName ?? ''}`}>
        <form onSubmit={submit} className="space-y-4">
          <Textarea label="Why would you like to help? (optional)" rows={4} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} hint="Mention any experience or the times you are free." />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setApplying(null)} disabled={busy === 'apply'}>Cancel</Button>
            <Button type="submit" loading={busy === 'apply'}>Send application</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Volunteer's check-in screen for one event. Access is enforced by the API; this just shows its answer. */
export function VolunteerEvent() {
  const { eventId } = useParams();
  const { data, error } = useApi((signal) => meApi.assignments(signal));
  const assignment = data?.assignments.find((a) => String(a.eventId) === eventId && a.staffRole === 'volunteer');

  if (!data && !error) return <PageLoader />;
  if (error) return <LoadError error={error} />;
  if (!assignment) {
    return <EmptyState icon="alert" title="You are not a volunteer for this event" action={<Link to="/volunteer" className="font-medium text-indigo-600">Back to volunteering</Link>} />;
  }

  return (
    <>
      <Link to="/volunteer" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Volunteering
      </Link>
      <PageHeader title={assignment.eventName} description={`${formatDate(assignment.date)} - ${assignment.venue}`} />
      <ScanPanel eventId={assignment.eventId} />
      <section aria-label="Crowd levels" className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Report crowd levels</h2>
        <p className="mb-3 mt-1 text-sm text-slate-600">Tell the organizer how busy each area is right now. Your name and the time are recorded with each report.</p>
        <ZoneReporter eventId={assignment.eventId} />
      </section>
    </>
  );
}
