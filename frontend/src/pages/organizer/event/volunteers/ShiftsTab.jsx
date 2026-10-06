import { useState } from 'react';
import { volunteerOpsApi } from '../../../../api';
import Badge from '../../../../components/ui/Badge.jsx';
import Button from '../../../../components/ui/Button.jsx';
import Card from '../../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Checkbox, Input } from '../../../../components/ui/FormField.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import Modal from '../../../../components/ui/Modal.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useSaver } from '../../../../hooks/useSaver.js';
import { formatDate } from '../../../../utils/format.js';
import { shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

const PRESETS = [
  { name: 'Morning Shift', startTime: '08:00', endTime: '12:00' },
  { name: 'Afternoon Shift', startTime: '12:00', endTime: '16:00' },
  { name: 'Evening Shift', startTime: '16:00', endTime: '19:00' },
];

function ShiftForm({ event, shift, departments, onClose, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState(shift ? { name: shift.name, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, requiredCount: String(shift.requiredCount) } : { name: '', date: event.date, startTime: '', endTime: '', requiredCount: '1' });
  const [picked, setPicked] = useState([]);
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async (e) => {
    e.preventDefault();
    const base = { ...v, name: v.name.trim(), requiredCount: Number(v.requiredCount) };
    const ok = await save('save', () => (shift ? volunteerOpsApi.updateShift(shift.id, base) : volunteerOpsApi.createShift(event.id, { ...base, departmentIds: picked })), shift ? 'Shift updated.' : `Shift created for ${picked.length} department${picked.length === 1 ? '' : 's'}.`);
    if (ok) onSaved();
  };

  return (
    <Modal open onClose={onClose} title={shift ? `Edit ${shift.name}` : 'Create a shift'} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        {!shift && (
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Quick start</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => <button key={p.name} type="button" onClick={() => setV((x) => ({ ...x, ...p }))} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">{p.name} ({shiftText(p.startTime, p.endTime)})</button>)}
            </div>
          </div>
        )}
        <Input label="Shift name" required value={v.name} onChange={set('name')} error={errors.name} maxLength={60} />
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Date" required type="date" min={event.date} max={event.endDate} value={v.date} onChange={set('date')} error={errors.date} />
          <Input label="Start" required type="time" value={v.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="End" required type="time" value={v.endTime} onChange={set('endTime')} error={errors.endTime} />
          <Input label="Volunteers needed" required type="number" min="0" value={v.requiredCount} onChange={set('requiredCount')} error={errors.requiredCount} hint="per department" />
        </div>
        {!shift && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-slate-700">Departments <span className="text-red-500" aria-hidden="true">*</span></legend>
            {departments.length === 0 ? <p className="text-sm text-slate-500">Create a department first.</p> : (
              <div className="grid gap-2 sm:grid-cols-2">{departments.map((d) => <Checkbox key={d.id} label={d.name} checked={picked.includes(d.id)} onChange={() => toggle(d.id)} />)}</div>
            )}
            {(errors.departmentId || errors.departmentIds) && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.departmentId || errors.departmentIds}</p>}
          </fieldset>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'save'} disabled={!shift && picked.length === 0}>{shift ? 'Save changes' : 'Create shift'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Shifts per department, with how many slots are filled. */
export default function ShiftsTab() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.shifts(event.id, signal), [event.id]);
  const departments = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await volunteerOpsApi.deleteShift(deleting.id);
      toast.success('Shift deleted.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const shifts = data?.shifts ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Break the day into shifts and say how many volunteers each department needs in each one.</p>
        <Button onClick={() => setEditing('new')}>Create shift</Button>
      </div>
      {!data && loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading shifts" />
      ) : shifts.length === 0 ? (
        <EmptyState icon="clock" title="No shifts yet" description="Morning, afternoon and evening shifts keep volunteers from overlapping and show where you still need people." action={<Button onClick={() => setEditing('new')}>Create a shift</Button>} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Shift</th><th scope="col" className="px-4 py-3">Department</th><th scope="col" className="px-4 py-3">Date</th><th scope="col" className="px-4 py-3">Time</th><th scope="col" className="px-4 py-3">Required</th><th scope="col" className="px-4 py-3">Assigned</th><th scope="col" className="px-4 py-3">Available</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{s.name}</td>
                    <td className="px-4 py-3">{s.departmentName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(s.date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{shiftText(s.startTime, s.endTime)}</td>
                    <td className="px-4 py-3">{s.requiredCount}</td>
                    <td className="px-4 py-3">{s.assigned}</td>
                    <td className="px-4 py-3"><Badge tone={s.available > 0 ? 'amber' : 'green'}>{s.available > 0 ? `${s.available} open` : 'Full'}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(s)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {editing && <ShiftForm event={event} shift={editing === 'new' ? null : editing} departments={departments.data?.departments ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(deleting)} title="Delete this shift?" confirmLabel="Delete" danger loading={busy} onCancel={() => setDeleting(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{deleting?.name}</strong> for {deleting?.departmentName} will be removed. Volunteers keep their duties; they just lose the link to this shift.</p>
      </ConfirmDialog>
    </div>
  );
}
