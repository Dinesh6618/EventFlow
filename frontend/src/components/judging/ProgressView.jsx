import { useState } from 'react';
import { ApiError, judgingApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadError from '../ui/LoadError.jsx';
import StatCard from '../ui/StatCard.jsx';

const STATUS = { submitted: ['green', 'Submitted'], draft: ['amber', 'In progress'], not_started: ['slate', 'Not started'] };

export default function ProgressView({ eventId }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.progress(eventId, signal), [eventId], { refreshMs: 15000 });
  const [unlocking, setUnlocking] = useState(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    setBusy(true);
    try {
      await judgingApi.unlock(eventId, unlocking.evaluationId);
      toast.success(`${unlocking.judgeName} can now edit their evaluation of ${unlocking.teamName}.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not unlock.');
    } finally {
      setBusy(false);
      setUnlocking(null);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;
  if (data.totalAssigned === 0) return <EmptyState icon="check" title="Nothing to track yet" description="Assign teams to judges first. Progress appears here as soon as they start scoring." />;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Evaluations submitted" value={`${data.totalSubmitted} / ${data.totalAssigned}`} icon="check" tone="green" />
        <StatCard label="Complete" value={`${data.percentage}%`} icon="dashboard" tone="indigo" />
        <StatCard label="Teams with no judge" value={data.unassignedTeams.length} icon="users" tone="amber" />
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={data.percentage} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${data.percentage}%` }} />
      </div>

      <section aria-label="By judge">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">By judge</h3>
        <Card>
          <ul className="divide-y divide-slate-100">
            {data.byJudge.map((j) => (
              <li key={j.judgeId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="font-medium text-slate-900">{j.name}</span>
                <span className="text-slate-600">{j.submitted} of {j.assigned} submitted{j.drafts > 0 && <span className="text-xs text-slate-400"> ({j.drafts} draft)</span>}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section aria-label="Evaluations">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Every evaluation</h3>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Team</th>
                  <th scope="col" className="px-4 py-3">Judge</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.evaluations.map((e) => {
                  const [tone, label] = STATUS[e.status];
                  return (
                    <tr key={`${e.teamId}-${e.judgeId}`}>
                      <td className="px-4 py-3 font-medium text-slate-900">{e.teamName}</td>
                      <td className="px-4 py-3 text-slate-600">{e.judgeName}</td>
                      <td className="px-4 py-3">
                        <Badge tone={tone}>{label}</Badge>
                        {e.editUnlocked && <Badge tone="amber">Unlocked</Badge>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.total === null ? '-' : `${e.total} / ${data.maxTotal}`}</td>
                      <td className="px-4 py-3 text-right">
                        {e.status === 'submitted' && !e.editUnlocked && (
                          <Button size="sm" variant="secondary" onClick={() => setUnlocking(e)}>Allow edits</Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <ConfirmDialog open={Boolean(unlocking)} title="Let the judge edit this evaluation?" confirmLabel="Allow edits" loading={busy} onCancel={() => setUnlocking(null)} onConfirm={unlock}>
        <p>
          <strong className="text-slate-900">{unlocking?.judgeName}</strong> will be able to change their scores for{' '}
          <strong className="text-slate-900">{unlocking?.teamName}</strong>. The evaluation locks again when they re-submit it.
        </p>
      </ConfirmDialog>
    </div>
  );
}
