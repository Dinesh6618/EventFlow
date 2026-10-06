import { useState } from 'react';
import { ApiError, teamsApi } from '../../../api';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import ConfirmDialog from '../../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { Checkbox, Input } from '../../../components/ui/FormField.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useEvent } from './EventManageLayout.jsx';

function Settings({ event, onSaved }) {
  const toast = useToast();
  const [values, setValues] = useState({
    teamEnabled: event.teamEnabled,
    minTeamSize: String(event.minTeamSize),
    maxTeamSize: String(event.maxTeamSize),
    allowMultipleTeams: event.allowMultipleTeams,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    const min = Number(values.minTeamSize);
    const max = Number(values.maxTeamSize);
    const found = {};
    if (!Number.isInteger(min) || min < 1) found.minTeamSize = 'Enter a whole number, at least 1';
    if (!Number.isInteger(max) || max < 1 || max > 50) found.maxTeamSize = 'Enter a whole number from 1 to 50';
    else if (max < min) found.maxTeamSize = 'Cannot be smaller than the minimum';
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    try {
      await teamsApi.settings(event.id, { ...values, minTeamSize: min, maxTeamSize: max });
      toast.success('Team settings saved.');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold text-slate-900">Team rules</h2>
      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        <Checkbox label="Participants form teams for this event" hint="Turn this on for hackathons and competitions."
          checked={values.teamEnabled} onChange={(e) => setValues((v) => ({ ...v, teamEnabled: e.target.checked }))} />
        {values.teamEnabled && (
          <>
            <div className="grid max-w-md grid-cols-2 gap-4">
              <Input label="Minimum team size" type="number" min="1" value={values.minTeamSize} onChange={(e) => setValues((v) => ({ ...v, minTeamSize: e.target.value }))} error={errors.minTeamSize} />
              <Input label="Maximum team size" type="number" min="1" max="50" value={values.maxTeamSize} onChange={(e) => setValues((v) => ({ ...v, maxTeamSize: e.target.value }))} error={errors.maxTeamSize} />
            </div>
            <Checkbox label="Allow a participant to be in more than one team" hint="When off, joining a second team is blocked."
              checked={values.allowMultipleTeams} onChange={(e) => setValues((v) => ({ ...v, allowMultipleTeams: e.target.checked }))} />
          </>
        )}
        <Button type="submit" loading={saving}>Save team rules</Button>
      </form>
    </Card>
  );
}

export default function TeamsPage() {
  const { event, reloadEvent } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => teamsApi.overview(event.id, signal), [event.id, event.teamEnabled]);
  const [disbanding, setDisbanding] = useState(null);
  const [busy, setBusy] = useState(false);

  const disband = async () => {
    setBusy(true);
    try {
      await teamsApi.disband(disbanding.id);
      toast.success(`"${disbanding.name}" was disbanded.`);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      setDisbanding(null);
    }
  };

  return (
    <div className="space-y-6">
      <Settings event={event} onSaved={() => { reloadEvent(); reload(); }} />

      {!event.teamEnabled ? (
        <EmptyState icon="users" title="Teams are switched off" description="Turn on team formation above to let registered participants create and join teams." />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !data && loading ? null : (
        <>
          <section aria-label="Teams">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Teams ({data.teams.length})</h2>
            {data.teams.length === 0 ? (
              <EmptyState icon="users" title="No teams yet" description="Teams show up here as participants create them." />
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">Team name</th>
                        <th scope="col" className="hidden px-4 py-3 sm:table-cell">Leader</th>
                        <th scope="col" className="px-4 py-3">Members</th>
                        <th scope="col" className="hidden px-4 py-3 md:table-cell">Project</th>
                        <th scope="col" className="px-4 py-3">Team status</th>
                        <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.teams.map((team) => (
                        <tr key={team.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{team.name}</p>
                            <p className="text-xs text-slate-500 sm:hidden">{team.leaderName ? `Led by ${team.leaderName}` : ''}</p>
                          </td>
                          <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{team.leaderName || '-'}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {team.memberCount}/{team.maxSize}
                            <span className="block text-xs text-slate-500">{team.members.map((m) => m.name).join(', ')}</span>
                          </td>
                          <td className="hidden max-w-56 px-4 py-3 text-slate-600 md:table-cell">
                            {team.projectTitle ? <span className="block truncate" title={team.projectTitle}>{team.projectTitle}</span> : <span className="text-slate-400">No project title</span>}
                            {team.projectTitle && <span className="text-xs text-slate-500">{team.submittedAt ? 'Submitted to judges' : 'Not submitted yet'}</span>}
                          </td>
                          <td className="px-4 py-3">
                            <Badge tone={team.isFull ? 'red' : team.isComplete ? 'green' : 'amber'}>{team.isFull ? 'Full' : team.isComplete ? 'Ready' : `Needs ${team.minSize}`}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDisbanding(team)}>Disband</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </section>

          <section aria-label="Participants without a team">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Without a team ({data.unassigned.length})</h2>
            {data.unassigned.length === 0 ? (
              <p className="text-sm text-slate-500">Everyone registered has joined a team.</p>
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100">
                  {data.unassigned.map((p) => (
                    <li key={p.userId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      <span className="text-xs text-slate-500">{[p.department, p.college].filter(Boolean).join(' - ')}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}

      <ConfirmDialog open={Boolean(disbanding)} title="Disband this team?" confirmLabel="Disband" danger loading={busy} onCancel={() => setDisbanding(null)} onConfirm={disband}>
        <p><strong className="text-slate-900">{disbanding?.name}</strong> and its {disbanding?.memberCount} members will be removed from the team. They will be notified.</p>
      </ConfirmDialog>
    </div>
  );
}
