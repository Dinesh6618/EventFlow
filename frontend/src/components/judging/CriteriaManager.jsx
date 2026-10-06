import { useState } from 'react';
import { ApiError, judgingApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { Input } from '../ui/FormField.jsx';
import LoadError from '../ui/LoadError.jsx';

const BLANK = { name: '', description: '', maxScore: '' };

export default function CriteriaManager({ eventId }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.criteria(eventId, signal), [eventId]);
  const [values, setValues] = useState(BLANK);
  const [editing, setEditing] = useState(null); // criterion id
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const startEdit = (c) => {
    setEditing(c.id);
    setValues({ name: c.name, description: c.description, maxScore: String(c.maxScore) });
    setErrors({});
  };
  const reset = () => {
    setEditing(null);
    setValues(BLANK);
    setErrors({});
  };

  const save = async (e) => {
    e.preventDefault();
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Name must be at least 2 characters';
    const max = Number(values.maxScore);
    if (!Number.isInteger(max) || max < 1 || max > 1000) found.maxScore = 'Enter a whole number from 1 to 1000';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    const body = { name: values.name.trim(), description: values.description.trim(), maxScore: max };
    try {
      if (editing) await judgingApi.updateCriterion(eventId, editing, body);
      else await judgingApi.createCriterion(eventId, body);
      toast.success(editing ? 'Criterion updated.' : 'Criterion added.');
      reset();
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.errors && Object.keys(err.errors).length) setErrors(err.errors);
      else toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await judgingApi.removeCriterion(eventId, removing.id);
      toast.success(`"${removing.name}" removed.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setRemoving(null);
    }
  };

  const total = data?.maxTotal ?? 0;

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h3 className="text-base font-semibold text-slate-900">{editing ? 'Edit criterion' : 'Add an evaluation criterion'}</h3>
        <form onSubmit={save} noValidate className="mt-4 grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Input label="Name" required value={values.name} onChange={set('name')} error={errors.name} maxLength={80} placeholder="e.g. Innovation" />
          <Input label="Maximum score" required type="number" min="1" max="1000" value={values.maxScore} onChange={set('maxScore')} error={errors.maxScore} />
          <div className="sm:col-span-2">
            <Input label="What judges should look for" value={values.description} onChange={set('description')} maxLength={500} />
          </div>
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" loading={saving}>{editing ? 'Save criterion' : 'Add criterion'}</Button>
            {editing && <Button variant="secondary" onClick={reset}>Cancel</Button>}
          </div>
        </form>
      </Card>

      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? null : data.criteria.length === 0 ? (
        <EmptyState icon="check" title="No criteria yet" description="Add the categories judges will score, for example Innovation 10, Technical 10, Impact 10, Presentation 10." />
      ) : (
        <div className="space-y-3">
          <Card>
            <ul className="divide-y divide-slate-100">
              {data.criteria.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{c.name}</p>
                    {c.description && <p className="text-sm text-slate-500">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="indigo">Out of {c.maxScore}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setRemoving(c)}>Remove</Button>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900">
                <span>Total score</span>
                <span>{total}</span>
              </li>
            </ul>
          </Card>
        </div>
      )}

      <ConfirmDialog open={Boolean(removing)} title="Remove this criterion?" confirmLabel="Remove" danger loading={busy} onCancel={() => setRemoving(null)} onConfirm={remove}>
        <p><strong className="text-slate-900">{removing?.name}</strong> will no longer be scored. This is only possible before judges start scoring.</p>
      </ConfirmDialog>
    </div>
  );
}
