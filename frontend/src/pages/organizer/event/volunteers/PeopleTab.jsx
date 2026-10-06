import { useState } from 'react';
import { Link } from 'react-router-dom';
import { staffApi, volunteerOpsApi } from '../../../../api';
import { ApplicationBadge, AttendanceStateBadge, DutyStatusBadge, LateBadge } from '../../../../components/volunteer/VolunteerBadges.jsx';
import Badge from '../../../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Checkbox, Input, Select, Textarea } from '../../../../components/ui/FormField.jsx';
import Icon from '../../../../components/ui/Icon.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import Modal from '../../../../components/ui/Modal.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { useSaver } from '../../../../hooks/useSaver.js';
import { useApi, useDebounced } from '../../../../hooks/useApi.js';
import { DUTY_STATUS, shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

const STATUS_OPTIONS = Object.entries(DUTY_STATUS).map(([value, { label }]) => ({ value, label }));
const ATTENDANCE_OPTIONS = [
  { value: 'not_checked_in', label: 'Not checked in' }, { value: 'checked_in', label: 'Checked in' }, { value: 'checked_out', label: 'Checked out' },
  { value: 'late', label: 'Late' }, { value: 'absent', label: 'Absent' },
];

/** Students who applied: read what they wrote, then approve or reject. */
function Applications({ eventId, onDecided }) {
  const toast = useToast();
  const { data, error, reload } = useApi((signal) => volunteerOpsApi.applications(eventId, signal), [eventId], { refreshMs: 30000 });
  const [busy, setBusy] = useState(null);
  const [showDecided, setShowDecided] = useState(false);

  const decide = async (a, status) => {
    setBusy(`${a.id}-${status}`);
    try {
      await volunteerOpsApi.decideApplication(eventId, a.id, status);
      toast.success(status === 'approved' ? `${a.name} is now a volunteer and can be assigned.` : `${a.name}'s application was rejected.`);
      reload();
      onDecided();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const all = data?.applications ?? [];
  const pending = all.filter((a) => a.status === 'pending');
  const decided = all.filter((a) => a.status !== 'pending');

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">Applications {pending.length > 0 && <Badge tone="amber">{pending.length} pending</Badge>}</h2>
        {decided.length > 0 && <button type="button" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700" onClick={() => setShowDecided((v) => !v)}>{showDecided ? 'Hide' : 'Show'} decided ({decided.length})</button>}
      </div>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No applications waiting. Students apply from their Volunteer page.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {pending.map((a) => (
            <li key={a.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-1.5 text-sm">
                <p className="font-semibold text-slate-900">{a.name} <span className="font-normal text-slate-500">{[a.department, a.applicationYear && `Year ${a.applicationYear}`].filter(Boolean).join(' - ')}</span></p>
                <p className="text-slate-500">{[a.email, a.phone].filter(Boolean).join(' - ')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {a.preferredDepartment && <Badge tone="indigo">Prefers {a.preferredDepartment}</Badge>}
                  {a.availability && <Badge tone="indigo">{a.availability}</Badge>}
                  {(a.skills ?? []).map((s) => <Badge key={s} tone="slate">{s}</Badge>)}
                </div>
                {a.experience && <p className="text-slate-600"><span className="font-medium">Experience:</span> {a.experience}</p>}
                {a.message && <p className="text-slate-600">&ldquo;{a.message}&rdquo;</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" loading={busy === `${a.id}-approved`} onClick={() => decide(a, 'approved')}>Approve</Button>
                <Button size="sm" variant="secondary" loading={busy === `${a.id}-declined`} onClick={() => decide(a, 'declined')}>Reject</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {showDecided && (
        <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {decided.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-3 py-2.5"><span className="font-medium text-slate-800">{a.name}</span><ApplicationBadge status={a.status} /></li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function EditVolunteer({ eventId, volunteer, onClose, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [isActive, setIsActive] = useState(volunteer.isActive);
  const [notes, setNotes] = useState(volunteer.notes ?? '');
  return (
    <Modal open onClose={onClose} title={`Edit ${volunteer.name}`}>
      <form noValidate className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (await save('edit', () => volunteerOpsApi.updateVolunteer(eventId, volunteer.userId, { isActive, notes: notes.trim() }), 'Volunteer updated.')) onSaved(); }}>
        <Checkbox label="Active for this event" hint="Switching someone off frees the duties they have not started and stops new assignments." checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        <Textarea label="Private note" rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} error={errors.notes} hint="Only you see this." />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'edit'}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Everyone approved as a volunteer for the event: search, filter, and act. */
export default function PeopleTab() {
  const { event } = useEvent();
  const toast = useToast();
  const [filters, setFilters] = useState({ search: '', departmentId: '', status: '', attendance: '', date: '' });
  const search = useDebounced(filters.search.trim());
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const departments = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]);
  const { data, error, loading, reload } = useApi(
    (signal) => volunteerOpsApi.volunteers(event.id, { ...filters, search }, signal),
    [event.id, search, filters.departmentId, filters.status, filters.attendance, filters.date],
    { refreshMs: 20000 },
  );
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));

  const remove = async () => {
    setBusy(true);
    try {
      await staffApi.remove(event.id, removing.staffId);
      toast.success(`${removing.name} was removed from the volunteer team.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const rows = data?.volunteers ?? [];
  const filtered = Boolean(search || filters.departmentId || filters.status || filters.attendance || filters.date);

  return (
    <div className="space-y-6">
      <Applications eventId={event.id} onDecided={reload} />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <label htmlFor="v-search" className="sr-only">Search volunteers</label>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input id="v-search" type="search" value={filters.search} onChange={set('search')} placeholder="Search name, email or volunteer ID" className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
          </div>
          <Select label="" aria-label="Department" value={filters.departmentId} onChange={set('departmentId')} placeholder="All departments" options={(departments.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))} />
          <Select label="" aria-label="Status" value={filters.status} onChange={set('status')} placeholder="Any status" options={STATUS_OPTIONS} />
          <Select label="" aria-label="Attendance" value={filters.attendance} onChange={set('attendance')} placeholder="Any attendance" options={ATTENDANCE_OPTIONS} />
          <Input label="" aria-label="Date" type="date" min={event.date} max={event.endDate} value={filters.date} onChange={set('date')} />
        </div>
      </Card>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading volunteers" />
      ) : rows.length === 0 ? (
        <EmptyState icon="users" title={filtered ? 'No volunteers match' : 'No volunteers yet'} description={filtered ? 'Try different filters.' : 'Approve an application above, or add people by email on the Team tab.'} action={!filtered && <Link to="../../staff" relative="path" className={buttonClasses('secondary')}>Open the Team tab</Link>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Volunteer</th>
                  <th scope="col" className="px-4 py-3">Department</th>
                  <th scope="col" className="hidden px-4 py-3 xl:table-cell">Shift</th>
                  <th scope="col" className="hidden px-4 py-3 lg:table-cell">Location</th>
                  <th scope="col" className="hidden px-4 py-3 xl:table-cell">Task</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">Attendance</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((v) => (
                  <tr key={v.userId} className={v.isActive ? '' : 'opacity-60'}>
                    <td className="px-4 py-3">
                      <Link to={String(v.userId)} className="font-semibold text-slate-900 hover:text-indigo-700">{v.name}</Link>
                      <p className="font-mono text-xs text-slate-400">{v.volunteerCode}</p>
                    </td>
                    <td className="px-4 py-3">{v.department ?? <span className="text-slate-400">-</span>}</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-slate-600 xl:table-cell">{v.current ? `${shiftText(v.current.startTime, v.current.endTime)}` : '-'}</td>
                    <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">{v.current?.location || '-'}</td>
                    <td className="hidden max-w-56 truncate px-4 py-3 text-slate-600 xl:table-cell" title={v.current?.task}>{v.current?.task || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3"><DutyStatusBadge status={v.status} /></td>
                    <td className="hidden whitespace-nowrap px-4 py-3 md:table-cell">{v.attendance ? <AttendanceStateBadge status={v.attendance} /> : <span className="text-slate-400">-</span>} <LateBadge late={v.late} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Link to={String(v.userId)} className={buttonClasses('ghost', 'sm')}>View</Link>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(v)}>Edit</Button>
                      <Link to={`../assignments?volunteer=${v.userId}`} relative="path" className={buttonClasses('ghost', 'sm')}>Reassign</Link>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setRemoving(v)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <EditVolunteer eventId={event.id} volunteer={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(removing)} title="Remove this volunteer?" confirmLabel="Remove" danger loading={busy} onCancel={() => setRemoving(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{removing?.name}</strong> will leave the volunteer team for this event. Duties they have not started are released.</p>
      </ConfirmDialog>
    </div>
  );
}
