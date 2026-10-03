import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { helpApi, meApi, volunteerApi, volunteerOpsApi } from '../../api';
import ScanPanel from '../../components/attendance/ScanPanel.jsx';
import { ZoneReporter } from '../../components/insights/ZonePanel.jsx';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';
import ApplyForm from '../../components/volunteer/ApplyForm.jsx';
import DutyCard from '../../components/volunteer/DutyCard.jsx';
import TaskCard from '../../components/volunteer/TaskCard.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
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
          <Link to={`/volunteer/events/${item.eventId}`} className={buttonClasses('primary', 'md', 'w-full')}>Open check-in tools</Link>
        ) : status === 'pending' ? (
          <Button variant="secondary" className="w-full" loading={busy} onClick={() => onWithdraw(item)}>Withdraw application</Button>
        ) : (
          <Button className="w-full" onClick={() => onApply(item)}>{status === 'declined' ? 'Apply again' : 'Apply to volunteer'}</Button>
        )}
      </div>
    </Card>
  );
}

/** Events looking for volunteers, with the full application form. */
function Opportunities({ onApplied }) {
  const toast = useToast();
  const opportunities = useApi((signal) => volunteerApi.opportunities(signal));
  const [applying, setApplying] = useState(null);
  const [busy, setBusy] = useState(null);

  const withdraw = async (item) => {
    setBusy(item.eventId);
    try {
      await volunteerApi.withdraw(item.eventId);
      toast.success('Application withdrawn.');
      opportunities.reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  const open = opportunities.data?.opportunities.filter((o) => !o.isVolunteer) ?? [];

  return (
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
          {open.map((o) => <li key={o.eventId}><Opportunity item={o} busy={busy === o.eventId} onApply={setApplying} onWithdraw={withdraw} /></li>)}
        </ul>
      )}
      {applying && <ApplyForm opportunity={applying} onClose={() => setApplying(null)} onSent={() => { setApplying(null); opportunities.reload(); onApplied?.(); }} />}
    </section>
  );
}

/** The volunteer's dashboard: today's duty with check-in, tasks, announcements, and events to apply to. */
export function VolunteerHome() {
  const { user } = useAuth();
  const dash = useApi((signal) => volunteerOpsApi.dashboard(signal), [], { refreshMs: 20000 });
  const assignments = useApi((signal) => meApi.assignments(signal));
  const helpRequests = useApi((signal) => helpApi.assignedToMe(signal), [], { refreshMs: 30000 });
  const helpOpen = helpRequests.data?.requests.length ?? 0;
  const mine = assignments.data?.assignments.filter((a) => a.staffRole === 'volunteer') ?? [];

  const refresh = () => {
    dash.reload();
    assignments.reload();
  };
  const d = dash.data;
  const today = d?.current ?? d?.today?.[0] ?? null;
  const upcoming = d?.next && d.next.id !== today?.id ? d.next : null;

  return (
    <>
      <PageHeader eyebrow="Volunteer" title={`Hello, ${user.name.split(' ')[0]}`} description="Your Volunteer Dashboard" action={d && <Badge tone="indigo">{d.volunteer.volunteerCode}</Badge>} />

      {dash.error ? (
        <LoadError error={dash.error} onRetry={dash.reload} />
      ) : !d ? (
        <PageLoader />
      ) : (
        <div className="space-y-8">
          {today ? (
            <DutyCard duty={today} featured onChanged={refresh} />
          ) : (
            <Card className="p-6 text-center sm:p-8">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Icon name="calendar" className="h-6 w-6" /></span>
              <h2 className="mt-3 text-lg font-bold text-slate-900">No duty today</h2>
              <p className="mt-1 text-sm text-slate-500">{upcoming ? 'Your next duty is below.' : 'When an organizer assigns you a shift, it shows up here with a check-in button.'}</p>
            </Card>
          )}

          {upcoming && (
            <section aria-labelledby="next-duty">
              <h2 id="next-duty" className="mb-3 text-lg font-bold text-slate-900">Next duty</h2>
              <DutyCard duty={upcoming} onChanged={refresh} />
            </section>
          )}

          {d.tasks.today.length > 0 && (
            <section aria-labelledby="today-tasks">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="today-tasks" className="text-lg font-bold text-slate-900">Today&apos;s tasks</h2>
                <Link to="/volunteer/tasks" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">All tasks</Link>
              </div>
              <ul className="space-y-4">{d.tasks.today.map((t) => <li key={t.id}><TaskCard task={t} onChanged={refresh} /></li>)}</ul>
            </section>
          )}

          {d.announcements.length > 0 && (
            <section aria-labelledby="announcements">
              <h2 id="announcements" className="mb-3 text-lg font-bold text-slate-900">From the organizer</h2>
              <ul className="space-y-3">
                {d.announcements.map((a) => (
                  <li key={a.id}>
                    <Card className="p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-900">{a.title}</h3><span className="text-xs text-slate-400">{a.eventName} - {timeAgo(a.createdAt)}</span></div>
                      <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.message}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4 text-center"><p className="text-2xl font-extrabold text-slate-900">{d.summary.hours} h</p><p className="text-xs text-slate-500">volunteered</p></Card>
            <Card className="p-4 text-center"><p className="text-2xl font-extrabold text-slate-900">{d.summary.completedDuties}</p><p className="text-xs text-slate-500">duties completed</p></Card>
            <Card className="p-4 text-center"><p className="text-2xl font-extrabold text-slate-900">{d.summary.tasksCompleted}</p><p className="text-xs text-slate-500">tasks completed</p></Card>
          </div>
        </div>
      )}

      <Link to="/volunteer/help" className="mt-8 flex items-center justify-between gap-4 rounded-2xl bg-slate-900 p-5 text-white shadow-lg transition-transform hover:-translate-y-0.5">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Icon name="shield" className="h-6 w-6" /></span>
          <div>
            <p className="font-extrabold">Help requests assigned to you</p>
            <p className="text-sm text-slate-300">{helpOpen ? `${helpOpen} waiting for you` : 'Nothing assigned right now'}</p>
          </div>
        </div>
        {helpOpen > 0 ? <Badge tone="amber">{helpOpen}</Badge> : <Icon name="arrow-right" className="h-5 w-5 text-slate-400" />}
      </Link>

      {mine.length > 0 && (
        <section aria-labelledby="my-events" className="mt-10">
          <h2 id="my-events" className="mb-3 text-xl font-bold text-slate-900">Events I volunteer at</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {mine.map((a) => (
              <li key={a.eventId}>
                <Card className="p-5">
                  <Badge tone="green">Volunteer</Badge>
                  <h3 className="mt-2 text-lg font-semibold text-slate-900">{a.eventName}</h3>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="calendar" className="h-4 w-4 text-slate-400" />{formatDate(a.date)}, {formatTimeRange(a.startTime, a.endTime)}</p>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><Icon name="pin" className="h-4 w-4 text-slate-400" />{a.venue}</p>
                  <Link to={`/volunteer/events/${a.eventId}`} className={buttonClasses('secondary', 'md', 'mt-4 w-full')}>Open QR check-in tools</Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10"><Opportunities onApplied={refresh} /></div>
    </>
  );
}

/** Volunteer's QR check-in and crowd reporting for one event. Access is enforced by the API. */
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
