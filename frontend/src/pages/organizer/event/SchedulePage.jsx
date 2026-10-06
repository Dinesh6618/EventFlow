import { useState } from 'react';
import { ApiError, scheduleApi } from '../../../api';
import ScheduleList from '../../../components/schedule/ScheduleList.jsx';
import Button from '../../../components/ui/Button.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../../components/ui/FormField.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { SESSION_TYPES, SESSION_TYPE_OPTIONS } from '../../../utils/constants.js';
import { validateSession } from '../../../utils/validation.js';
import { useEvent } from './EventManageLayout.jsx';

const BLANK = (event) => ({ title: '', description: '', date: event.date, startTime: '', endTime: '', venue: event.venue, speaker: '', sessionType: 'session' });

function SessionForm({ event, session, onClose, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState(session ? { ...session } : BLANK(event));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const found = validateSession(values, event);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    const body = Object.fromEntries(['title', 'description', 'date', 'startTime', 'endTime', 'venue', 'speaker', 'sessionType'].map((k) => [k, String(values[k] ?? '').trim()]));
    try {
      if (session) await scheduleApi.update(event.id, session.id, body);
      else await scheduleApi.create(event.id, body);
      toast.success(session ? 'Session updated. Participants were notified.' : 'Session added. Participants were notified.');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const multiDay = event.endDate !== event.date;
  return (
    <Modal open onClose={onClose} title={session ? 'Edit session' : 'Add session'}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Title" required value={values.title} onChange={set('title')} error={errors.title} maxLength={150} />
        <Select label="Session type" required value={values.sessionType} onChange={set('sessionType')} error={errors.sessionType}
          options={SESSION_TYPE_OPTIONS} hint={SESSION_TYPES[values.sessionType]?.description} />
        <Input label="Date" required type="date" min={event.date} max={event.endDate} value={values.date} onChange={set('date')} error={errors.date}
          hint={multiDay ? 'Pick one of the event days.' : undefined} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Start time" required type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="End time" required type="time" value={values.endTime} onChange={set('endTime')} error={errors.endTime} />
        </div>
        <Input label="Venue" value={values.venue} onChange={set('venue')} error={errors.venue} maxLength={200} />
        <Input label="Speaker" value={values.speaker} onChange={set('speaker')} error={errors.speaker} maxLength={150} />
        <Textarea label="Description" rows={3} value={values.description} onChange={set('description')} error={errors.description} />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>{session ? 'Save changes' : 'Add session'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function SchedulePage() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => scheduleApi.list(event.id, signal), [event.id]);
  const [editing, setEditing] = useState(null); // 'new' | session
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await scheduleApi.remove(event.id, deleting.id);
      toast.success(`"${deleting.title}" removed. Participants were notified.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  };

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">Sessions, talks, breaks and rounds. Registered participants are notified when you change anything.</p>
        <Button onClick={() => setEditing('new')}>Add session</Button>
      </div>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? null : data.items.length === 0 ? (
        <EmptyState icon="calendar" title="No sessions yet" description="Build the programme participants will see on the event page."
          action={<Button onClick={() => setEditing('new')}>Add the first session</Button>} />
      ) : (
        <ScheduleList
          items={data.items}
          nextId={data.next?.id}
          renderActions={(item) => (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(item)} aria-label={`Edit ${item.title}`}>Edit</Button>
              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleting(item)} aria-label={`Delete ${item.title}`}>Delete</Button>
            </>
          )}
        />
      )}

      {editing && (
        <SessionForm
          event={event}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      <ConfirmDialog open={Boolean(deleting)} title="Delete this session?" confirmLabel="Delete" danger loading={busy} onCancel={() => setDeleting(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{deleting?.title}</strong> will be removed from the schedule and registered participants will be told.</p>
      </ConfirmDialog>
    </div>
  );
}
