import { useState } from 'react';
import { ApiError, teamsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi, useDebounced } from '../../hooks/useApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { Input } from '../ui/FormField.jsx';
import ProfileAvatar from '../ui/ProfileAvatar.jsx';
import LoadError from '../ui/LoadError.jsx';
import TeamCard, { SkillChips } from './TeamCard.jsx';
import TeamForm from './TeamForm.jsx';

// Common roles to look for; the team's own wanted skills are listed first.
const COMMON_ROLES = ['UI/UX Designer', 'Frontend Developer', 'Backend Developer', 'AI/ML Engineer', 'Data Analyst', 'Mobile Developer', 'Presenter'];

const STRENGTH = { exact: 'Exact match', close: 'Close match', related: 'Related skill' };

/** Teammate suggestions for a team's leader, ranked by skill fit. */
function Suggestions({ team, onInvited }) {
  const toast = useToast();
  const [skill, setSkill] = useState('');
  const wanted = useDebounced(skill.trim());
  const { data, error, reload } = useApi((signal) => teamsApi.suggestions(team.id, wanted, signal), [team.id, wanted, team.memberCount]);
  const [busy, setBusy] = useState(null);

  const invite = async (person) => {
    setBusy(person.userId);
    try {
      await teamsApi.invite(team.id, person.userId);
      toast.success(`Invitation sent to ${person.name}.`);
      onInvited();
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the invitation.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-5">
      <h4 className="text-base font-semibold text-slate-900">Find Teammates</h4>
      <p className="mt-0.5 text-xs text-slate-500">
        Registered participants without a team, ranked by how well their skills fit what you are looking for. This is a rule-based match, not a guarantee.
      </p>
      <div className="mt-3 max-w-sm">
        <Input
          label="Looking for"
          list={`roles-${team.id}`}
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          placeholder={team.skills.length ? "Pick a role or type a skill (blank = my team's wanted skills)" : 'Pick a role or type a skill, e.g. UI/UX Designer'}
          autoComplete="off"
        />
        <datalist id={`roles-${team.id}`}>
          {[...new Set([...team.skills, ...COMMON_ROLES])].map((r) => <option key={r} value={r} />)}
        </datalist>
      </div>
      {error ? (
        <div className="mt-3"><LoadError error={error} onRetry={reload} /></div>
      ) : data?.needed.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Add the skills you are looking for to your team, or search a skill above.</p>
      ) : data?.suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No available participants match {data.needed.join(', ')} yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {data?.suggestions.map((person) => (
            <li key={person.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar name={person.name} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{person.name}</p>
                  <p className="text-xs text-slate-500">{[person.department, person.college].filter(Boolean).join(' - ')}</p>
                  <p className="mt-1 text-xs text-indigo-700">
                    {person.matches.map((m) => `${m.skill} for ${m.need} (${STRENGTH[m.strength]})`).join('; ')}
                  </p>
                </div>
              </div>
              <Button size="sm" variant="secondary" loading={busy === person.userId} onClick={() => invite(person)}>Invite</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** A team I belong to: members, leader tools (requests, invitations, suggestions), leave/disband. */
export default function MyTeam({ team, me, onChanged }) {
  const toast = useToast();
  const isLeader = team.myRole === 'leader';
  const detail = useApi((signal) => (isLeader ? teamsApi.detail(team.id, signal) : Promise.resolve(null)), [team.id, isLeader, team.memberCount]);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(null); // { kind: 'leave' | 'disband' | 'remove', member? }
  const [busy, setBusy] = useState(false);

  const act = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast.success(success);
      onChanged();
      detail.reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const requests = detail.data?.invitations?.filter((i) => i.kind === 'request') ?? [];
  const sent = detail.data?.invitations?.filter((i) => i.kind === 'invite') ?? [];

  return (
    <div className="space-y-4">
      <TeamCard team={team} highlight>
        <Badge tone={isLeader ? 'indigo' : 'slate'}>{isLeader ? 'You lead this team' : 'You are a member'}</Badge>
        {isLeader && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit team</Button>}
        <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: 'leave' })}>Leave team</Button>
        {isLeader && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirm({ kind: 'disband' })}>Disband</Button>}
      </TeamCard>

      {(team.projectDescription || isLeader) && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-slate-900">Project</h4>
            <div className="flex items-center gap-2">
              <Badge tone={team.submittedAt ? 'green' : 'amber'}>{team.submittedAt ? 'Submitted to judges' : 'Not submitted yet'}</Badge>
              {isLeader && !team.submittedAt && (
                <Button size="sm" loading={busy} onClick={() => act(() => teamsApi.submitProject(team.id), 'Project submitted. Judges can now see it.')}>Submit project</Button>
              )}
            </div>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">{team.projectTitle || 'Untitled project'}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{team.projectDescription || 'No description yet.'}</p>
          {(team.repositoryUrl || team.demoUrl) && (
            <p className="mt-2 flex flex-wrap gap-4 text-sm">
              {team.repositoryUrl && <a href={team.repositoryUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:text-indigo-700">Repository</a>}
              {team.demoUrl && <a href={team.demoUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:text-indigo-700">Demo</a>}
            </p>
          )}
        </Card>
      )}

      <Card className="p-5">
        <h4 className="text-sm font-semibold text-slate-900">Members</h4>
        <ul className="mt-2 divide-y divide-slate-100">
          {team.members.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <ProfileAvatar name={m.name} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{m.name}{m.userId === me && ' (you)'}</p>
                  <p className="text-xs text-slate-500">{m.role === 'leader' ? 'Team Leader' : m.skills?.[0] || [m.department].filter(Boolean).join('')}</p>
                  <div className="mt-1"><SkillChips skills={m.skills} empty="" /></div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={m.role === 'leader' ? 'indigo' : 'slate'}>{m.role === 'leader' ? 'Leader' : 'Member'}</Badge>
                {isLeader && m.role !== 'leader' && (
                  <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setConfirm({ kind: 'remove', member: m })}>Remove</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {isLeader && (
        <>
          {detail.error && <LoadError error={detail.error} onRetry={detail.reload} />}
          {requests.length > 0 && (
            <Card className="p-5">
              <h4 className="text-sm font-semibold text-slate-900">Requests to join ({requests.length})</h4>
              <ul className="mt-2 divide-y divide-slate-100">
                {requests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{r.name}</p>
                      <p className="text-xs text-slate-500">{[r.department, r.college].filter(Boolean).join(' - ')}</p>
                      <div className="mt-1"><SkillChips skills={r.skills} empty="" /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" loading={busy} onClick={() => act(() => teamsApi.respond(r.id, true), `${r.name} joined your team.`)}>Accept</Button>
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => teamsApi.respond(r.id, false), 'Request declined.')}>Decline</Button>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {sent.length > 0 && (
            <Card className="p-5">
              <h4 className="text-sm font-semibold text-slate-900">Invitations sent ({sent.length})</h4>
              <ul className="mt-2 divide-y divide-slate-100">
                {sent.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span>{i.name} <span className="text-xs text-slate-400">pending</span></span>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => teamsApi.cancelInvitation(i.id), 'Invitation cancelled.')}>Cancel</Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {!team.isFull && <Suggestions team={team} onInvited={() => detail.reload()} />}
        </>
      )}

      {editing && (
        <TeamForm
          eventId={team.eventId}
          team={team}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.kind === 'leave' ? 'Leave this team?' : confirm?.kind === 'disband' ? 'Disband this team?' : 'Remove this member?'}
        confirmLabel={confirm?.kind === 'leave' ? 'Leave team' : confirm?.kind === 'disband' ? 'Disband team' : 'Remove'}
        danger
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm.kind === 'leave') act(() => teamsApi.leave(team.id), `You left "${team.name}".`);
          else if (confirm.kind === 'disband') act(() => teamsApi.disband(team.id), `"${team.name}" was disbanded.`);
          else act(() => teamsApi.removeMember(team.id, confirm.member.userId), `${confirm.member.name} was removed.`);
        }}
      >
        {confirm?.kind === 'leave' && <p>{isLeader && team.memberCount > 1 ? 'Leadership will pass to the member who has been in the team longest.' : 'You will no longer be part of this team.'}{team.memberCount === 1 && ' The team will be closed because you are its only member.'}</p>}
        {confirm?.kind === 'disband' && <p>All {team.memberCount} members will be removed and the team will be deleted.</p>}
        {confirm?.kind === 'remove' && <p><strong className="text-slate-900">{confirm.member.name}</strong> will be removed from the team.</p>}
      </ConfirmDialog>
    </div>
  );
}
