import { useState } from 'react';
import { volunteerOpsApi } from '../../../../api';
import { PriorityBadge } from '../../../../components/help/HelpBadges.jsx';
import { TaskStatusBadge } from '../../../../components/volunteer/VolunteerBadges.jsx';
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
import { formatDate, todayISO } from '../../../../utils/format.js';
import { PRIORITIES, PRIORITY_META } from '../../../../utils/help.js';
import { TASK_STATUS, shiftText } from '../../../../utils/volunteer.js';
import { useEvent } from '../EventManageLayout.jsx';

function TaskForm({ event, task, departments, assignments, onClose, onSaved }) {
  const { busy, errors, save } = useSaver();
  const [allowCompleted, setAllowCompleted] = useState(false);
  const day = todayISO() >= event.date && todayISO() <= (event.endDate || event.date) ? todayISO() : event.date;
  const [v, setV] = useState(
    task
      ? { userId: String(task.volunteer.userId), departmentId: String(task.department.id), title: task.title, description: task.description, location: task.location, date: task.date, startTime: task.startTime, endTime: task.endTime, priority: task.priority, instructions: task.instructions }
      : { userId: '', departmentId: '', title: '', description: '', location: '', date: day, startTime: '', endTime: '', priority: 'medium', instructions: '' },
  );
  const set = (key) => (e) => setV((p) => ({ ...p, [key]: e.target.value }));

  // Only volunteers who already hold a duty in the department can be given one of its tasks.
  const eligible = [...new Map(assignments.filter((a) => String(a.department.id) === v.departmentId && ['assigned', 'accepted', 'completed'].includes(a.status)).map((a) => [a.volunteer.userId, a.volunteer])).values()];
  const pickDepartment = (e) => {
    const d = departments.find((x) => String(x.id) === e.target.value);
    setV((p) => ({ ...p, departmentId: e.target.value, userId: '', location: p.location || d?.location || '', instructions: p.instructions || d?.instructions || '' }));
  };
  const locked = task?.status === 'completed';

  const submit = async (e) => {
    e.preventDefault();
    const body = { userId: Number(v.userId), departmentId: Number(v.departmentId), title: v.title.trim(), description: v.description.trim(), location: v.location.trim(), date: v.date, startTime: v.startTime, endTime: v.endTime, priority: v.priority, instructions: v.instructions.trim() };
    const ok = await save('save', () => (task ? volunteerOpsApi.updateTask(task.id, { ...body, allowCompleted }) : volunteerOpsApi.createTask(event.id, body)), task ? 'Task updated.' : 'Task created and the volunteer was notified.');
    if (ok) onSaved();
  };

  return (
    <Modal open onClose={onClose} title={task ? 'Edit task' : 'Create a task'} size="lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        {locked && <Checkbox label="This task is completed. I want to edit it anyway." hint="Completed tasks are locked unless you confirm." checked={allowCompleted} onChange={(e) => setAllowCompleted(e.target.checked)} />}
        <Input label="Task name" required value={v.title} onChange={set('title')} error={errors.title} maxLength={150} placeholder="e.g. Manage Registration Desk" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Department" required value={v.departmentId} onChange={pickDepartment} error={errors.departmentId} placeholder="Choose a department" options={departments.map((d) => ({ value: d.id, label: d.name }))} />
          <Select label="Assigned volunteer" required value={v.userId} onChange={set('userId')} error={errors.userId} placeholder={v.departmentId ? (eligible.length ? 'Choose a volunteer' : 'Nobody is assigned to this department yet') : 'Choose a department first'} options={eligible.map((p) => ({ value: p.userId, label: p.name }))} />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Input label="Date" required type="date" min={event.date} max={event.endDate} value={v.date} onChange={set('date')} error={errors.date} />
          <Input label="Start" required type="time" value={v.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="End" required type="time" value={v.endTime} onChange={set('endTime')} error={errors.endTime} />
          <Select label="Priority" value={v.priority} onChange={set('priority')} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        </div>
        <Input label="Location" value={v.location} onChange={set('location')} error={errors.location} maxLength={150} />
        <Textarea label="Description" rows={2} value={v.description} onChange={set('description')} error={errors.description} maxLength={2000} />
        <Textarea label="Instructions" rows={4} value={v.instructions} onChange={set('instructions')} error={errors.instructions} maxLength={3000} placeholder={'1. Verify participant QR code.\n2. Guide participants to the correct hall.'} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy === 'save'} disabled={locked && !allowCompleted}>{task ? 'Save changes' : 'Create task'}</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Tasks for volunteers: create, edit, complete or cancel. */
export default function TasksTab() {
  const { event } = useEvent();
  const toast = useToast();
  const [filters, setFilters] = useState({ status: '', departmentId: '', priority: '' });
  const set = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }));
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.tasks(event.id, filters, signal), [event.id, filters.status, filters.departmentId, filters.priority], { refreshMs: 15000 });
  const departments = useApi((signal) => volunteerOpsApi.departments(event.id, signal), [event.id]);
  const assignments = useApi((signal) => volunteerOpsApi.assignments(event.id, {}, signal), [event.id]);
  const [editing, setEditing] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [busy, setBusy] = useState(null);

  const act = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
      setCancelling(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  const tasks = data?.tasks ?? [];
  const depts = departments.data?.departments ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Give volunteers specific jobs with a place, a time and clear instructions.</p>
        <Button onClick={() => setEditing('new')} disabled={depts.length === 0}>Create task</Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label="" aria-label="Status" value={filters.status} onChange={set('status')} placeholder="Any status" options={Object.entries(TASK_STATUS).map(([value, { label }]) => ({ value, label }))} />
          <Select label="" aria-label="Department" value={filters.departmentId} onChange={set('departmentId')} placeholder="All departments" options={depts.map((d) => ({ value: d.id, label: d.name }))} />
          <Select label="" aria-label="Priority" value={filters.priority} onChange={set('priority')} placeholder="Any priority" options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_META[p].label }))} />
        </div>
      </Card>

      {!data && loading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading tasks" />
      ) : tasks.length === 0 ? (
        <EmptyState icon="check" title="No tasks" description={depts.length === 0 ? 'Create a department and assign volunteers first.' : 'Create a task and it appears here, and on the volunteer\'s dashboard.'} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th scope="col" className="px-4 py-3">Task</th><th scope="col" className="px-4 py-3">Volunteer</th><th scope="col" className="hidden px-4 py-3 md:table-cell">Department</th><th scope="col" className="px-4 py-3">When</th><th scope="col" className="px-4 py-3">Priority</th><th scope="col" className="px-4 py-3">Status</th><th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <tr key={t.id} className={t.status === 'cancelled' ? 'opacity-60' : ''}>
                    <td className="px-4 py-3"><p className="font-semibold text-slate-900">{t.title}</p>{t.location && <p className="text-xs text-slate-400">{t.location}</p>}</td>
                    <td className="px-4 py-3">{t.volunteer.name}</td>
                    <td className="hidden px-4 py-3 md:table-cell">{t.department.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(t.date)}<span className="block text-xs">{shiftText(t.startTime, t.endTime)}</span></td>
                    <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-4 py-3"><TaskStatusBadge status={t.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {t.capabilities.canComplete && <Button size="sm" variant="ghost" loading={busy === `c${t.id}`} onClick={() => act(`c${t.id}`, () => volunteerOpsApi.completeTask(t.id), 'Task marked completed.')}>Complete</Button>}
                      {t.capabilities.canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>}
                      {t.capabilities.canCancel && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setCancelling(t)}>Cancel</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {editing && <TaskForm event={event} task={editing === 'new' ? null : editing} departments={depts} assignments={assignments.data?.assignments ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <ConfirmDialog open={Boolean(cancelling)} title="Cancel this task?" confirmLabel="Cancel task" danger loading={busy === 'cancel'} onCancel={() => setCancelling(null)} onConfirm={() => act('cancel', () => volunteerOpsApi.updateTask(cancelling.id, { status: 'cancelled' }), 'Task cancelled. The volunteer was told.')}>
        <p><strong className="text-slate-900">{cancelling?.title}</strong> will be cancelled for {cancelling?.volunteer.name}.</p>
      </ConfirmDialog>
    </div>
  );
}

