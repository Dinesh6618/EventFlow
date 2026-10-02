import { useState } from 'react';
import { ApiError, aiApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { todayISO } from '../../utils/format.js';
import Button from '../ui/Button.jsx';
import { Input, Textarea } from '../ui/FormField.jsx';
import Modal from '../ui/Modal.jsx';

const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Noon, N days before the event; if that has already passed, one hour from now. */
function suggestDeadline(date, daysBefore) {
  if (!date) return '';
  const target = new Date(`${date}T12:00:00`);
  target.setDate(target.getDate() - daysBefore);
  const soonest = new Date(Date.now() + 60 * 60 * 1000);
  return local(target < soonest ? soonest : target);
}

/** Last step: the plan decides the structure; the organizer supplies the facts only they know. */
export default function PublishModal({ plan, onClose, onPublished }) {
  const { user } = useAuth();
  const toast = useToast();
  const d = plan.publishDefaults;
  const [values, setValues] = useState({
    name: d.name,
    description: d.description,
    date: '',
    startTime: d.startTime,
    endTime: d.endTime,
    venue: '',
    registrationDeadline: '',
    organizerName: user.name,
    organizerContact: user.email,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const labels = { name: 'Event name', description: 'Description', date: 'Date', startTime: 'Start time', endTime: 'End time', venue: 'Venue', registrationDeadline: 'Registration deadline', organizerName: 'Organizer name', organizerContact: 'Organizer contact' };
    const missing = Object.fromEntries(Object.entries(labels).filter(([key]) => !String(values[key]).trim()).map(([key, label]) => [key, `${label} is required`]));
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    setSaving(true);
    try {
      const result = await aiApi.publish(plan.id, values);
      toast.success(`"${result.event.name}" is now an event.`);
      onPublished(result.event);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Publish as an event">
      <p className="mb-4 text-slate-600">
        This creates the event with its {d.sessions} scheduled session{d.sessions === 1 ? '' : 's'}
        {d.criteria ? `, ${d.criteria} judging criteria` : ''}
        {d.team.enabled ? `, and teams of ${d.team.minSize} to ${d.team.maxSize}` : ''}. Capacity is {d.maxParticipants}
        {d.requiresApproval ? ' with organizer approval' : ''}. Add the details only you know.
      </p>
      <form onSubmit={submit} noValidate className="space-y-4">
        <Input label="Event name" required value={values.name} onChange={set('name')} error={errors.name} />
        <Textarea label="Description" required rows={3} value={values.description} onChange={set('description')} error={errors.description} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={d.days > 1 ? `First day (runs ${d.days} days)` : 'Date'}
            required
            type="date"
            min={todayISO()}
            value={values.date}
            onChange={(e) => {
              const date = e.target.value;
              setValues((v) => ({ ...v, date, registrationDeadline: v.registrationDeadline || suggestDeadline(date, d.deadlineDaysBeforeEvent) }));
              setErrors((prev) => ({ ...prev, date: undefined }));
            }}
            error={errors.date}
          />
          <Input label="Venue" required value={values.venue} onChange={set('venue')} error={errors.venue} />
          <Input label="First session starts" required type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
          <Input label="Last session ends" required type="time" value={values.endTime} onChange={set('endTime')} error={errors.endTime} />
          <div className="sm:col-span-2">
            <Input label="Registration deadline" required type="datetime-local" value={values.registrationDeadline} onChange={set('registrationDeadline')} error={errors.registrationDeadline} hint={`The plan suggests closing ${d.deadlineDaysBeforeEvent} days before.`} />
          </div>
          <Input label="Organizer name" required value={values.organizerName} onChange={set('organizerName')} error={errors.organizerName} />
          <Input label="Organizer contact" required value={values.organizerContact} onChange={set('organizerContact')} error={errors.organizerContact} />
        </div>
        {errors.endDate && <p role="alert" className="text-xs font-medium text-red-600">{errors.endDate}</p>}
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" loading={saving}>Create event</Button>
        </div>
      </form>
    </Modal>
  );
}
