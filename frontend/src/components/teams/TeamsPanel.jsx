import { useState } from 'react';
import { ApiError, teamsApi } from '../../api';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import LoadError from '../ui/LoadError.jsx';
import Spinner from '../ui/Spinner.jsx';
import MyTeam from './MyTeam.jsx';
import TeamCard from './TeamCard.jsx';
import TeamForm from './TeamForm.jsx';

/** Participant-side teams for one event: my team(s), invitations, teams to join, create a team. */
export default function TeamsPanel({ event }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => teamsApi.list(event.id, signal), [event.id], { refreshMs: 30000 });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(null);

  if (!data && loading) return <div className="flex justify-center py-8"><Spinner className="h-6 w-6 text-indigo-600" /></div>;
  if (error) return <LoadError error={error} onRetry={reload} />;

  const { teams, rules } = data;
  const mine = teams.filter((t) => t.myRole);
  const invitedTo = teams.filter((t) => t.myInvitation?.kind === 'invite');
  const requested = teams.filter((t) => t.myInvitation?.kind === 'request');
  const others = teams.filter((t) => !t.myRole && !t.myInvitation);
  const canStartAnother = rules.allowMultipleTeams || mine.length === 0;

  const run = async (key, fn, success) => {
    setBusy(key);
    try {
      await fn();
      if (success) toast.success(success);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
      reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        Teams of {rules.minTeamSize === rules.maxTeamSize ? rules.minTeamSize : `${rules.minTeamSize} to ${rules.maxTeamSize}`} people.
        {rules.allowMultipleTeams ? ' You may belong to more than one team.' : ' You can belong to one team.'}
      </p>

      {invitedTo.map((team) => (
        <Alert key={team.id} type="info" action={
          <div className="flex gap-2">
            <Button size="sm" loading={busy === `a${team.id}`} onClick={() => run(`a${team.id}`, () => teamsApi.respond(team.myInvitation.id, true), `You joined "${team.name}".`)}>Accept</Button>
            <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => run(`d${team.id}`, () => teamsApi.respond(team.myInvitation.id, false), 'Invitation declined.')}>Decline</Button>
          </div>
        }>
          <span className="font-medium">{team.leaderName}</span> invited you to join <span className="font-medium">{team.name}</span>.
        </Alert>
      ))}

      {mine.map((team) => (
        <MyTeam key={team.id} team={team} me={user.id} onChanged={reload} />
      ))}

      {canStartAnother && (
        <div>
          <Button onClick={() => setCreating(true)}>{mine.length ? 'Create another team' : 'Create a team'}</Button>
        </div>
      )}

      {requested.length > 0 && (
        <section aria-label="Your requests">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Waiting for a reply</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {requested.map((team) => (
              <TeamCard key={team.id} team={team}>
                <span className="text-xs text-slate-500">Request sent to {team.leaderName}</span>
                <Button size="sm" variant="ghost" loading={busy === `c${team.id}`} onClick={() => run(`c${team.id}`, () => teamsApi.cancelInvitation(team.myInvitation.id), 'Request withdrawn.')}>Withdraw</Button>
              </TeamCard>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Teams you can join">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Teams looking for members</h3>
        {others.length === 0 ? (
          <EmptyState icon="users" title={teams.length ? 'No other teams to join' : 'No teams yet'} description="Create a team and invite people, or check back when others have created theirs." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {others.map((team) => {
              const blocked = team.isFull || (!rules.allowMultipleTeams && mine.length > 0);
              return (
                <TeamCard key={team.id} team={team}>
                  <Button size="sm" disabled={blocked} loading={busy === `r${team.id}`} onClick={() => run(`r${team.id}`, () => teamsApi.requestToJoin(team.id), `Request sent to ${team.leaderName}.`)}>
                    Request to join
                  </Button>
                  {team.isFull && <span className="text-xs text-slate-500">This team is full</span>}
                </TeamCard>
              );
            })}
          </div>
        )}
      </section>

      {creating && (
        <TeamForm
          eventId={event.id}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
    </div>
  );
}
