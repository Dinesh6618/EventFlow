import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, judgingApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadError from '../ui/LoadError.jsx';

function JudgeCard({ judge, teams, eventId, onSaved }) {
  const toast = useToast();
  const [selected, setSelected] = useState(new Set(judge.teamIds));
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(new Set(judge.teamIds)), [judge.teamIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = selected.size !== judge.teamIds.length || judge.teamIds.some((id) => !selected.has(id));
  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await judgingApi.setAssignments(eventId, judge.userId, [...selected]);
      toast.success(`${judge.name}'s teams saved.`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{judge.name}</p>
          <p className="text-xs text-slate-500">{judge.email} - {judge.teamIds.length} team{judge.teamIds.length === 1 ? '' : 's'} assigned</p>
        </div>
        <Button size="sm" onClick={save} loading={saving} disabled={!dirty}>Save</Button>
      </div>
      <fieldset className="mt-4">
        <legend className="sr-only">Teams for {judge.name}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {teams.map((team) => (
            <label key={team.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50">
              <input type="checkbox" checked={selected.has(team.id)} onChange={() => toggle(team.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <span className="truncate">{team.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
}

export default function AssignmentsManager({ eventId }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.assignments(eventId, signal), [eventId]);
  const [perTeam, setPerTeam] = useState('2');
  const [assigning, setAssigning] = useState(false);

  const auto = async () => {
    setAssigning(true);
    try {
      const { added } = await judgingApi.autoAssign(eventId, Number(perTeam));
      toast.success(added ? `${added} assignment${added === 1 ? '' : 's'} added.` : 'Every team already has enough judges.');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAssigning(false);
    }
  };

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;
  if (data.judges.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No judges yet"
        description="Add judges on the Team tab (role: judge). They need a participant account."
        action={<Link to="../staff" className="font-medium text-indigo-600">Go to Team</Link>}
      />
    );
  }
  if (data.teams.length === 0) return <EmptyState icon="users" title="No teams to assign yet" description="Teams appear here once participants create them." />;

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-end gap-4 p-5">
        <div>
          <label htmlFor="per-team" className="mb-1.5 block text-sm font-medium text-slate-700">Judges per team</label>
          <select id="per-team" value={perTeam} onChange={(e) => setPerTeam(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={auto} loading={assigning}>Auto-assign evenly</Button>
        <p className="max-w-md text-xs text-slate-500">Adds the judges with the lightest load to teams that need more. Existing assignments are kept, and judges are never given their own team.</p>
      </Card>
      <div className="space-y-4">
        {data.judges.map((judge) => (
          <JudgeCard key={judge.userId} judge={judge} teams={data.teams} eventId={eventId} onSaved={reload} />
        ))}
      </div>
    </div>
  );
}
