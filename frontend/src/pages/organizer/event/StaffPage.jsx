import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, staffApi } from '../../../api';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { Input, Select } from '../../../components/ui/FormField.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';

/** Volunteers (check-in) and judges for one event. People must already have a participant account. */
export default function StaffPage() {
  const { eventId } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => staffApi.list(eventId, signal), [eventId]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('volunteer');
  const [fieldError, setFieldError] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFieldError('Enter a valid email address');
      return;
    }
    setAdding(true);
    setFieldError('');
    try {
      const { staff } = await staffApi.add(eventId, email.trim(), role);
      toast.success(`${staff.name} added as ${role}.`);
      setEmail('');
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.errors?.email) setFieldError(err.errors.email);
      else toast.error(err.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await staffApi.remove(eventId, removing.id);
      toast.success(`${removing.name} removed.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Add a team member</h2>
        <p className="mt-1 text-sm text-slate-500">
          Volunteers can scan QR codes at the entrance. Judges score teams. They sign in with their normal participant account.
        </p>
        <form onSubmit={add} noValidate className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-start">
          <Input label="Participant email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setFieldError(''); }} error={fieldError} placeholder="name@college.edu" />
          <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={['volunteer', 'judge']} />
          <div className="sm:pt-[1.625rem]">
            <Button type="submit" loading={adding} className="w-full">Add</Button>
          </div>
        </form>
      </Card>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? null : data.staff.length === 0 ? (
        <EmptyState icon="users" title="No team members yet" description="Add volunteers to help with check-in and judges to evaluate teams." />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {data.staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{member.name}</p>
                  <p className="truncate text-sm text-slate-500">{member.email}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={member.staffRole === 'judge' ? 'amber' : 'green'}>{member.staffRole}</Badge>
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setRemoving(member)}>Remove</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog open={Boolean(removing)} title="Remove team member?" confirmLabel="Remove" danger loading={busy} onCancel={() => setRemoving(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{removing?.name}</strong> will lose access to this event.</p>
      </ConfirmDialog>
    </div>
  );
}
