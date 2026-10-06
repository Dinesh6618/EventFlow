import { useState } from 'react';
import { volunteerOpsApi } from '../../../../api';
import DepartmentCard from '../../../../components/volunteer/DepartmentCard.jsx';
import { PriorityBadge } from '../../../../components/help/HelpBadges.jsx';
import Button from '../../../../components/ui/Button.jsx';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../../../components/ui/FormField.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import Modal from '../../../../components/ui/Modal.jsx';
import { useToast } from '../../../../context/ToastContext.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useSaver } from '../../../../hooks/useSaver.js';
import { PRIORITIES, PRIORITY_META } from '../../../../utils/help.js';
import { shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

const BLANK = { name: '', description: '', requiredCount: '1', location: '', shiftStart: '', shiftEnd: '', instructions: '', priority: 'medium' };

function DepartmentForm({ event, department, templates, onClose, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [v, setV] = useState(department ? { name: department.name, description: department.description, requiredCount: String(department.requiredCount), location: department.location, shiftStart: department.shiftStart ?? '', shiftEnd: department.shiftEnd ?? '', instructions: department.instructions, priority: department.priority } : BLANK);
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));

  const useTemplate = (e) => {
    const t = templates.find((x) => String(x.id) === e.target.value);
    if (t) setV((p) => ({ ...p, name: t.name, description: t.description, instructions: t.instructions }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const body = { ...v, name: v.name.trim(), requiredCount: Number(v.requiredCount), shiftStart: v.shiftStart || undefined, shiftEnd: v.shiftEnd || undefined };
    const ok = await save('save', () => (department ? volunteerOpsApi.updateDepartment(department.id, body) : volunteerOpsApi.createDepartment(event.id, body)), department ? 'Department updated.' : 'Department created.');
    if (ok) onSaved();
  };

  return (
    <Modal open onClose={onClose} title={department ? `Edit ${department.name}` : 'Create a department'} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        {!department && templates.length > 0 && (
          <Select label="Start from a template (optional)" value="" onChange={useTemplate} placeholder="Choose a common department" options={templates.map((t) => ({ value: t.id, label: t.name }))} hint="Or type your own name below." />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Department name" required value={v.name} onChange={set('name')} error={errors.name} maxLength={80} placeholder="e.g. Technical Support" />
          <Input label="Required volunteers" required type="number" min="0" max="500" value={v.requiredCount} onChange={set('requiredCount')} error={errors.requiredCount} />
        </div>
        <Input label="Location" value={v.location} onChange={set('location')} error={errors.location} maxLength={150} placeholder="e.g. A Block - Lab 3" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Shift start" type="time" value={v.shiftStart} onChange={set('shiftStart')} error={errors.shiftStart} hint="Default for new assignments" />
          <Input label="Shift end" type="time" value={v.shiftEnd} onChange={set('shiftEnd')} error={errors.shiftEnd} />
          <Select label="Priority" value={v.priority} onChange={set('priority')} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        </div>
        <Textarea label="Description" rows={2} value={v.description} onChange={set('description')} error={errors.description} maxLength={500} />
        <Textarea label="Instructions for volunteers" rows={3} value={v.instructions} onChange={set('instructions')} error={errors.instructions} maxLength={3000} placeholder="What should volunteers do here?" />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'save'}>{department ? 'Save changes' : 'Create department'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Departments for the event, and how many volunteers each needs. Custom departments are fine. */
export default function DepartmentsTab() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]);
  const [editing, setEditing] = useState(null); // 'new' | department
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await volunteerOpsApi.deleteDepartment(deleting.id);
      toast.success(`${deleting.name} was deleted.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const departments = (data?.departments ?? []).map((d) => ({ ...d, status: d.assigned > d.requiredCount ? 'over' : d.needed === 0 ? 'complete' : 'needed' }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Say which teams you need and how many people each should have.</p>
        <Button onClick={() => setEditing('new')}>Create department</Button>
      </div>

      {!data && loading ? (
        <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading departments" />
      ) : departments.length === 0 ? (
        <EmptyState icon="users" title="No departments yet" description="Registration, Technical Support, Food Management, Stage Management, Help Desk: create the teams you need, or add your own." action={<Button onClick={() => setEditing('new')}>Create the first department</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <li key={d.id}>
              <DepartmentCard department={d}>
                <div className="mt-3 space-y-0.5 text-sm text-slate-600">
                  {d.location && <p>{d.location}</p>}
                  {d.shiftStart && d.shiftEnd && <p>{shiftText(d.shiftStart, d.shiftEnd)}</p>}
                  <p className="pt-1"><PriorityBadge priority={d.priority} /></p>
                </div>
                {d.instructions && <p className="mt-2 line-clamp-2 text-xs text-slate-500">{d.instructions}</p>}
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(d)}>Delete</Button>
                </div>
              </DepartmentCard>
            </li>
          ))}
        </ul>
      )}

      {editing && <DepartmentForm event={event} department={editing === 'new' ? null : editing} templates={data?.templates ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(deleting)} title="Delete this department?" confirmLabel="Delete" danger loading={busy} onCancel={() => setDeleting(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{deleting?.name}</strong> and its shifts will be removed. A department with active assignments cannot be deleted until they are reassigned.</p>
      </ConfirmDialog>
    </div>
  );
}
