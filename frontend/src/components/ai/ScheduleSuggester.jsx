import { useState } from 'react';
import { ApiError, aiApi } from '../../api';
import { SESSION_TYPES } from '../../utils/constants.js';
import { formatTime } from '../../utils/format.js';
import Alert from '../ui/Alert.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import { Input } from '../ui/FormField.jsx';

/**
 * Asks the AI for a different schedule. The answer is only a proposal: it is shown here and changes
 * the plan only if the organizer chooses "Use this schedule".
 */
export default function ScheduleSuggester({ planId, plan, onUse, disabled }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ durationHours: '', expectedParticipants: '', sessionCount: '', breakMinutes: '', breakEveryHours: '', startTime: '', days: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState(null);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const ask = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProposal(null);
    try {
      const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));
      setProposal((await aiApi.suggestSchedule(planId, body)).schedule);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors) setErrors(err.errors);
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled}>Suggest a new schedule with AI</Button>;
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Suggest a new schedule</h3>
          <p className="text-sm text-slate-500">Tell the AI what to aim for. You will see its suggestion first; your current schedule changes only if you use it.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setProposal(null); }}>Close</Button>
      </div>
      <form onSubmit={ask} noValidate className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Input label="Days" type="number" min="1" max="14" value={values.days} onChange={set('days')} error={errors.days} placeholder={String(plan.structure.days)} />
        <Input label="Total hours" type="number" min="0.5" value={values.durationHours} onChange={set('durationHours')} error={errors.durationHours} placeholder={String(plan.structure.durationHours)} />
        <Input label="Participants" type="number" min="1" value={values.expectedParticipants} onChange={set('expectedParticipants')} error={errors.expectedParticipants} placeholder={String(plan.structure.expectedParticipants)} />
        <Input label="Sessions" type="number" min="1" value={values.sessionCount} onChange={set('sessionCount')} error={errors.sessionCount} />
        <Input label="Start time" type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
        <Input label="Break length (min)" type="number" min="5" value={values.breakMinutes} onChange={set('breakMinutes')} error={errors.breakMinutes} />
        <Input label="Break every (hours)" type="number" min="1" value={values.breakEveryHours} onChange={set('breakEveryHours')} error={errors.breakEveryHours} />
        <div className="flex items-end"><Button type="submit" loading={loading} className="w-full">Suggest</Button></div>
      </form>
      {error && <Alert type="error">{error}</Alert>}

      {proposal && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Suggested schedule ({proposal.length} sessions)</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { onUse(proposal); setProposal(null); setOpen(false); }}>Use this schedule</Button>
              <Button size="sm" variant="secondary" onClick={() => setProposal(null)}>Discard</Button>
            </div>
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200 bg-white text-sm">
            {proposal.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
                <span className="w-24 shrink-0 text-xs font-medium text-slate-500">Day {s.day}, {formatTime(s.startTime)}</span>
                <span className="min-w-0 flex-1 font-medium text-slate-900">{s.title}</span>
                <Badge tone={SESSION_TYPES[s.sessionType]?.tone ?? 'slate'}>{SESSION_TYPES[s.sessionType]?.label ?? s.sessionType}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Using it replaces the schedule in your draft. You can still edit it and nothing is saved until you press Save changes.</p>
        </div>
      )}
    </Card>
  );
}
