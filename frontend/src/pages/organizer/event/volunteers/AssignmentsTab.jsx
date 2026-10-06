import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { volunteerOpsApi } from '../../../../api';
import { DutyStatusBadge } from '../../../../components/volunteer/VolunteerBadges.jsx';
import Badge from '../../../../components/ui/Badge.jsx';
import Button from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Checkbox, Input, Select, Textarea } from '../../../../components/ui/FormField.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import Modal from '../../../../components/ui/Modal.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useSaver } from '../../../../hooks/useSaver.js';
import { formatDate } from '../../../../utils/format.js';
import { shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

/** Create or change a duty. Shows what the chosen volunteer already has that day before you commit. */
function AssignmentForm({ event, assignment, volunteers, departments, shifts, assignments, preselect, onDone, onCancel }) {
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState(
    assignment
      ? { userId: String(assignment.volunteer.userId), departmentId: String(assignment.department.id), shiftId: assignment.shift ? String(assignment.shift.id) : '', date: assignment.date, startTime: assignment.startTime, endTime: assignment.endTime, location: assignment.location, task: assignment.task, allowOverflow: false }
      : { userId: preselect ?? '', departmentId: '', shiftId: '', date: event.date, startTime: '', endTime: '', location: '', task: '', allowOverflow: false },
  );
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const pickDepartment = (e) => {
    const d = departments.find((x) => String(x.id) === e.target.value);
    setV((p) => ({ ...p, departmentId: e.target.value, shiftId: '', startTime: p.startTime || d?.shiftStart || '', endTime: p.endTime || d?.shiftEnd || '', location: p.location || d?.location || '' }));
  };
  const pickShift = (e) => {
    const s = shifts.find((x) => String(x.id) === e.target.value);
    setV((p) => ({ ...p, shiftId: e.target.value, ...(s ? { date: s.date, startTime: s.startTime, endTime: s.endTime } : {}) }));
  };

  const dept = departments.find((d) => String(d.id) === v.departmentId);
  const deptShifts = shifts.filter((s) => String(s.departmentId) === v.departmentId);
  const booked = v.userId ? assignments.filter((a) => String(a.volunteer.userId) === v.userId && a.date === v.date && a.id !== assignment?.id && ['assigned', 'accepted'].includes(a.status)) : [];

  const submit = async (e) => {
    e.preventDefault();
    const body = {
      userId: Number(v.userId), departmentId: Number(v.departmentId), shiftId: v.shiftId ? Number(v.shiftId) : null,
      date: v.date || undefined, startTime: v.startTime || undefined, endTime: v.endTime || undefined, location: v.location.trim(), task: v.task.trim(), allowOverflow: v.allowOverflow,
    };
    const ok = await save('save', () => (assignment ? volunteerOpsApi.updateAssignment(assignment.id, body) : volunteerOpsApi.assign(event.id, body)), assignment ? 'Assignment changed. The volunteer was asked to accept it again.' : 'Volunteer assigned and notified.');
    if (ok) onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Select label="Volunteer" required value={v.userId} onChange={set('userId')} error={errors.userId} placeholder="Choose a volunteer" options={volunteers.map((p) => ({ value: p.userId, label: `${p.name}${p.isActive ? '' : ' (deactivated)'}` }))} />
        <Select label="Department" required value={v.departmentId} onChange={pickDepartment} error={errors.departmentId} placeholder="Choose a department" options={departments.map((d) => ({ value: d.id, label: `${d.name} (${d.assigned}/${d.requiredCount})` }))} />
      </div>
      {dept && <p className="-mt-1 text-xs text-slate-500">{dept.needed > 0 ? `${dept.needed} more volunteer${dept.needed === 1 ? '' : 's'} needed in ${dept.name}.` : `${dept.name} already has the volunteers it needs.`}</p>}
      <div className="grid gap-4 sm:grid-cols-4">
        <Select label="Shift" value={v.shiftId} onChange={pickShift} error={errors.shiftId} placeholder="No specific shift" options={deptShifts.map((s) => ({ value: s.id, label: `${s.name} ${shiftText(s.startTime, s.endTime)} (${s.available} open)` }))} />
        <Input label="Date" type="date" min={event.date} max={event.endDate} value={v.date} onChange={set('date')} error={errors.date} />
        <Input label="Start" type="time" value={v.startTime} onChange={set('startTime')} error={errors.startTime} />
        <Input label="End" type="time" value={v.endTime} onChange={set('endTime')} error={errors.endTime} />
      </div>
      {v.userId && (
        <p className={`rounded-xl px-3.5 py-2.5 text-sm ${booked.length ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`} aria-live="polite">
          {booked.length ? <>Already booked on {formatDate(v.date)}: {booked.map((a) => `${a.department.name} ${shiftText(a.startTime, a.endTime)}`).join(', ')}. Shifts cannot overlap.</> : <>Free on {formatDate(v.date)}: no other duties that day.</>}
        </p>
      )}
      <Input label="Location" value={v.location} onChange={set('location')} error={errors.location} maxLength={150} placeholder="e.g. Main Entrance" />
      <Textarea label="Task" rows={2} value={v.task} onChange={set('task')} error={errors.task} maxLength={300} placeholder="e.g. Verify participant registration and guide students." />
      <Checkbox label="Allow one more than required" hint="Only needed when the department or shift is already full." checked={v.allowOverflow} onChange={set('allowOverflow')} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" loading={busy === 'save'}>{assignment ? 'Save changes' : 'Assign volunteer'}</Button>
      </div>
    </form>
  );
}

function ReassignmentRequests({ requests, onChanged }) {
  const toast = useToast();
  const [reviewing, setReviewing] = useState(null); // { request, status }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = requests.filter((r) => r.status === 'requested');
  if (pending.length === 0) return null;

  const decide = async () => {
    setBusy(true);
    try {
      await volunteerOpsApi.decideReassignment(reviewing.request.id, reviewing.status, note.trim());
      toast.success(reviewing.status === 'approved' ? `${reviewing.request.volunteerName} was released. You can assign them somewhere else.` : 'Request rejected. The volunteer keeps their duty.');
      setReviewing(null);
      setNote('');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-amber-200 bg-amber-50/40 p-5">
      <h2 className="text-base font-bold text-slate-900">Reassignment requests <Badge tone="amber">{pending.length}</Badge></h2>
      <ul className="mt-3 divide-y divide-amber-100">
        {pending.map((r) => (
          <li key={r.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-slate-900">{r.volunteerName} <span className="font-normal text-slate-500">wants to leave {r.departmentName}, {formatDate(r.date)} {shiftText(r.startTime, r.endTime)}</span></p>
              <p className="text-slate-600">&ldquo;{r.reason}&rdquo;</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" onClick={() => setReviewing({ request: r, status: 'approved' })}>Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => setReviewing({ request: r, status: 'rejected' })}>Reject</Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal open={Boolean(reviewing)} onClose={() => setReviewing(null)} title={reviewing?.status === 'approved' ? 'Approve this request?' : 'Reject this request?'}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">{reviewing?.status === 'approved' ? 'The volunteer is released from this duty and the slot reopens. Tasks they had not started are cancelled.' : 'The volunteer keeps their duty.'}</p>
          <Textarea label="Note to the volunteer (optional)" rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setReviewing(null)}>Cancel</Button>
            <Button loading={busy} onClick={decide}>{reviewing?.status === 'approved' ? 'Approve' : 'Reject'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/** Assign, reassign and remove volunteers, and answer their reassignment requests. */
export default function AssignmentsTab() {
  const { event } = useEvent();
  const toast = useToast();
  const [params] = useSearchParams();
  const assignments = useApi((signal) => volunteerOpsApi.assignments(event.id, {}, signal), [event.id], { refreshMs: 20000 });
  const volunteers = useApi((signal) => volunteerOpsApi.volunteers(event.id, {}, signal), [event.id]);
  const departments = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]);
  const shifts = useApi((signal) => volunteerOpsApi.shifts(event.id, signal), [event.id]);
  const requests = useApi((signal) => volunteerOpsApi.reassignments(event.id, signal), [event.id], { refreshMs: 20000 });
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const refresh = () => {
    assignments.reload();
    departments.reload();
    shifts.reload();
    requests.reload();
  };

  const remove = async () => {
    setBusy(true);
    try {
      await volunteerOpsApi.removeAssignment(removing.id);
      toast.success('Assignment removed. The volunteer was told.');
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const error = assignments.error || volunteers.error || departments.error || shifts.error;
  if (error) return <LoadError error={error} onRetry={refresh} />;
  const rows = assignments.data?.assignments ?? [];
  const people = volunteers.data?.volunteers ?? [];
  const depts = departments.data?.departments ?? [];
  const allShifts = shifts.data?.shifts ?? [];
  const ready = assignments.data && volunteers.data && departments.data && shifts.data;
  const mine = params.get('volunteer');

  return (
    <div className="space-y-6">
      <ReassignmentRequests requests={requests.data?.requests ?? []} onChanged={refresh} />

      <Card className="p-5 sm:p-6">
        <h2 className="text-base font-bold text-slate-900">Assign a volunteer</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">Pick a volunteer, a department and a time. You will see what they already have that day, and overlapping shifts are refused.</p>
        {!ready ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : people.length === 0 ? (
          <p className="text-sm text-slate-500">You need approved volunteers first. Approve applications on the Volunteers tab.</p>
        ) : depts.length === 0 ? (
          <p className="text-sm text-slate-500">Create a department first on the Departments tab.</p>
        ) : (
          <AssignmentForm key={`${formKey}-${mine}`} event={event} volunteers={people} departments={depts} shifts={allShifts} assignments={rows} preselect={mine} onDone={() => { setFormKey((k) => k + 1); refresh(); }} />
        )}
      </Card>

      <section aria-labelledby="assignments-heading">
        <h2 id="assignments-heading" className="mb-3 text-lg font-bold text-slate-900">Assignments ({rows.length})</h2>
        {!assignments.data && assignments.loading ? <div className="h-32 animate-pulse rounded-2xl bg-slate-200" /> : rows.length === 0 ? (
          <EmptyState icon="users" title="Nobody is assigned yet" description="Assignments you create appear here, with their status and attendance." />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th scope="col" className="px-4 py-3">Volunteer</th><th scope="col" className="px-4 py-3">Department</th><th scope="col" className="px-4 py-3">When</th><th scope="col" className="hidden px-4 py-3 lg:table-cell">Location</th><th scope="col" className="hidden px-4 py-3 xl:table-cell">Task</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <tr key={a.id} className={mine && String(a.volunteer.userId) === mine ? 'bg-indigo-50/50' : ''}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{a.volunteer.name}</td>
                      <td className="px-4 py-3">{a.department.name}{a.shift && <span className="block text-xs text-slate-400">{a.shift.name}</span>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(a.date)}<span className="block text-xs">{shiftText(a.startTime, a.endTime)}</span></td>
                      <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{a.location || '-'}</td>
                      <td className="hidden max-w-[14rem] truncate px-4 py-3 text-slate-600 xl:table-cell" title={a.task}>{a.task || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <DutyStatusBadge status={a.liveStatus ?? 'assigned'}>{a.status === 'assigned' ? 'Awaiting acceptance' : undefined}</DutyStatusBadge>
                        {a.reassignmentRequested && <Badge tone="amber" className="ml-1">Reassign requested</Badge>}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" disabled={!a.capabilities.canEdit} onClick={() => setEditing(a)}>Reassign</Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" disabled={!a.capabilities.canRemove} onClick={() => setRemoving(a)}>Remove</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={`Change ${editing.volunteer.name}'s assignment`} size="lg">
          <AssignmentForm event={event} assignment={editing} volunteers={people} departments={depts} shifts={allShifts} assignments={rows} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />
        </Modal>
      )}
      <ConfirmDialog open={Boolean(removing)} title="Remove this assignment?" confirmLabel="Remove" danger loading={busy} onCancel={() => setRemoving(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{removing?.volunteer.name}</strong> will be taken off {removing?.department.name} on {removing && formatDate(removing.date)}. Tasks they have not started are cancelled, and the change is recorded in the audit trail.</p>
      </ConfirmDialog>
    </div>
  );
}
