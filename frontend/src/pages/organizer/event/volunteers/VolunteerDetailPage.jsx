import { Link, useParams } from 'react-router-dom';
import { volunteerOpsApi } from '../../../../api';
import { AttendanceStateBadge, DutyStatusBadge, LateBadge, TaskStatusBadge } from '../../../../components/volunteer/VolunteerBadges.jsx';
import { PriorityBadge } from '../../../../components/help/HelpBadges.jsx';
import Badge from '../../../../components/ui/Badge.jsx';
import { buttonClasses } from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import Icon from '../../../../components/ui/Icon.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import { PageLoader } from '../../../../components/ui/Spinner.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { formatDate } from '../../../../utils/format.js';
import { clockTime } from '../../../../utils/help.js';
import { minutesText, shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

function Fact({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900">{children || <span className="font-normal text-slate-400">Not provided</span>}</dd>
    </div>
  );
}

/** One volunteer: profile, current duty, attendance, tasks and everything that has happened. */
export default function VolunteerDetailPage() {
  const { event } = useEvent();
  const { userId } = useParams();
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.volunteer(event.id, userId, signal), [event.id, userId], { refreshMs: 20000 });

  if (!data && loading) return <PageLoader label="Loading volunteer..." />;
  if (error) return error.status === 404 ? <p className="text-slate-600">That volunteer is not on this event&apos;s team. <Link to={`/organizer/events/${event.id}/volunteers/people`} className="font-semibold text-indigo-600">Back to volunteers</Link></p> : <LoadError error={error} onRetry={reload} />;

  const { volunteer: v, currentAssignment: c, assignments, attendance, tasks, timeline, application } = data;

  return (
    <div className="space-y-6">
      <Link to={`/organizer/events/${event.id}/volunteers/people`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        All volunteers
      </Link>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{v.name}</h1>
          <p className="font-mono text-sm text-slate-500">{v.volunteerCode}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DutyStatusBadge status={v.status} />
          {v.platformStatus === 'suspended' && <Badge tone="red">Suspended by admin</Badge>}
          <Link to={`/organizer/events/${event.id}/volunteers/assignments?volunteer=${v.userId}`} className={buttonClasses('primary', 'sm')}>Assign or reassign</Link>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Profile</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Fact label="Email">{v.email}</Fact>
            <Fact label="Phone">{v.phone}</Fact>
            <Fact label="Department">{[v.department, v.year && `Year ${v.year}`].filter(Boolean).join(', ')}</Fact>
            <Fact label="College">{v.college}</Fact>
            <Fact label="Availability">{v.availability}</Fact>
            <Fact label="Interests">{v.interests}</Fact>
            <div className="sm:col-span-2"><Fact label="Skills">{v.skills?.length ? <span className="flex flex-wrap gap-1.5">{v.skills.map((s) => <Badge key={s} tone="slate">{s}</Badge>)}</span> : null}</Fact></div>
            <div className="sm:col-span-2"><Fact label="Experience">{v.experience}</Fact></div>
            {v.notes && <div className="sm:col-span-2"><Fact label="Your note">{v.notes}</Fact></div>}
            {application && <div className="sm:col-span-2"><Fact label="Preferred department when applying">{application.preferredDepartment}</Fact></div>}
          </dl>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Current assignment</h2>
          {c ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact label="Event">{c.eventName}</Fact>
              <Fact label="Department">{c.department.name}</Fact>
              <Fact label="Task">{c.task}</Fact>
              <Fact label="Location">{c.location}</Fact>
              <Fact label="Shift">{`${formatDate(c.date)}, ${shiftText(c.startTime, c.endTime)}`}</Fact>
              <Fact label="Status"><DutyStatusBadge status={c.liveStatus ?? 'available'} /></Fact>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">No assignment yet.</p>
          )}
          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Attendance <span className="font-normal text-slate-500">({data.totalHours} h in total)</span></h3>
          {attendance.length === 0 ? <p className="text-sm text-slate-500">Has not checked in yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {attendance.map((a) => (
                <li key={a.assignmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{a.department} <span className="text-slate-500">{formatDate(a.date)}</span></span>
                  <span className="text-slate-600">{clockTime(a.checkInTime)} - {a.checkOutTime ? clockTime(a.checkOutTime) : 'on duty'} ({minutesText(a.minutes)}) <LateBadge late={a.late} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Tasks</h2>
          {[['Pending', tasks.pending], ['Completed', tasks.completed]].map(([label, list]) => (
            <div key={label} className="mb-4 last:mb-0">
              <h3 className="mb-1.5 text-sm font-medium text-slate-500">{label} ({list.length})</h3>
              {list.length === 0 ? <p className="text-sm text-slate-500">None.</p> : (
                <ul className="divide-y divide-slate-100 text-sm">
                  {list.map((t) => <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium text-slate-900">{t.title}</span><span className="flex gap-1.5"><PriorityBadge priority={t.priority} /><TaskStatusBadge status={t.status} /></span></li>)}
                </ul>
              )}
            </div>
          ))}
          <h3 className="mb-1.5 mt-5 text-sm font-medium text-slate-500">All assignments ({assignments.length})</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{a.department.name} <span className="text-slate-500">{formatDate(a.date)}, {shiftText(a.startTime, a.endTime)}</span></span>
                <span className="flex gap-1.5">{a.status === 'removed' ? <Badge tone="slate">Removed</Badge> : <DutyStatusBadge status={a.liveStatus ?? 'assigned'} />}<AttendanceStateBadge status={a.attendance} /></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Activity timeline</h2>
          {timeline.length === 0 ? <p className="text-sm text-slate-500">Nothing has happened yet.</p> : (
            <ol className="space-y-3">
              {timeline.map((t) => (
                <li key={t.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="text-slate-800">{t.message}</p>
                    <p className="text-xs text-slate-400">{new Date(t.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{t.by ? ` - ${t.by}` : ''}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
