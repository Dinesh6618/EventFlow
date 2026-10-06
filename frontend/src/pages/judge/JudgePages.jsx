import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, judgingApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Textarea } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate } from '../../utils/format.js';

const EVAL_STATUS = { submitted: ['green', 'Submitted'], draft: ['amber', 'Draft'], not_started: ['slate', 'Not started'] };

/** Events where the signed-in participant is a judge. */
export function JudgingHome() {
  const { data, error, loading, reload } = useApi((signal) => judgingApi.myEvents(signal));
  return (
    <>
      <PageHeader title="Judging" description="Events where you score teams." />
      {!data && loading ? <PageLoader /> : error ? <LoadError error={error} onRetry={reload} /> : data.events.length === 0 ? (
        <EmptyState icon="check" title="You are not a judge anywhere yet" description="When an organizer adds you as a judge, the event appears here." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.events.map((e) => (
            <li key={e.eventId}>
              <Card className="p-5">
                <Badge tone="indigo">Judge</Badge>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">{e.eventName}</h2>
                <p className="text-sm text-slate-500">{formatDate(e.date)}</p>
                <p className="mt-3 text-sm text-slate-600">{e.submitted} of {e.assigned} evaluations submitted</p>
                <Link to={`/judging/events/${e.eventId}`} className={buttonClasses('primary', 'md', 'mt-4 w-full')}>Open</Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Teams assigned to the judge for one event. */
export function JudgingEvent() {
  const { eventId } = useParams();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.myTeams(eventId, signal), [eventId]);
  if (!data && loading) return <PageLoader />;
  if (error) return <LoadError error={error} onRetry={reload} />;

  return (
    <>
      <Link to="/judging" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><Icon name="arrow-left" className="h-4 w-4" />Judging</Link>
      <PageHeader title={data.event.name} description={`Scoring out of ${data.maxTotal}`} />
      {data.criteria.length === 0 && <Alert type="info" className="mb-4">The organizer has not set the evaluation criteria yet. You can read the projects, but scoring opens once criteria exist.</Alert>}
      {data.teams.length === 0 ? (
        <EmptyState icon="users" title="No teams assigned to you yet" description="The organizer will assign teams. You will get a notification." />
      ) : (
        <ul className="space-y-3">
          {data.teams.map((team) => {
            const [tone, label] = EVAL_STATUS[team.evaluationStatus];
            return (
              <li key={team.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{team.name}</p>
                    <p className="text-sm text-slate-500">{team.projectTitle || 'No project title'}{team.submitted ? '' : ' - project not submitted yet'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={tone}>{label}</Badge>
                    {team.editUnlocked && <Badge tone="amber">Edits allowed</Badge>}
                    <Link to={`/judging/events/${eventId}/teams/${team.id}`} className={buttonClasses('secondary', 'sm')}>
                      {team.evaluationStatus === 'submitted' && !team.editUnlocked ? 'View' : 'Evaluate'}
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

/** One criterion as a row: its name on the left, the score and its maximum on the right. */
function ScoreField({ criterion, value, error, disabled, onChange }) {
  const id = `score-${criterion.id}`;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-900">{criterion.name}</label>
        {criterion.description && <p className="text-xs text-slate-500">{criterion.description}</p>}
      </div>
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min="0"
            max={criterion.maxScore}
            step="0.5"
            value={value}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value)}
            className={`block w-20 rounded-lg border bg-white px-3 py-2 text-right text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:bg-slate-100 ${error ? 'border-red-400' : 'border-slate-300'}`}
          />
          <span className="w-9 text-sm text-slate-500">/ {criterion.maxScore}</span>
        </div>
        {error && <p role="alert" className="mt-1 max-w-[11rem] text-xs font-medium text-red-600">{error}</p>}
      </div>
    </div>
  );
}

/** Scoring form for one team: project details on top, scores and comments below. */
export function JudgingTeam() {
  const { eventId, teamId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.teamDetail(eventId, teamId, signal), [eventId, teamId]);
  const [scores, setScores] = useState({});
  const [comments, setComments] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!data) return;
    setScores(Object.fromEntries(data.criteria.map((c) => [c.id, data.evaluation.scores[c.id] ?? ''])));
    setComments(data.evaluation.comments ?? '');
    setErrors({});
  }, [data]);

  const locked = data?.evaluation.status === 'submitted' && !data.evaluation.editUnlocked;
  const total = useMemo(() => Object.values(scores).reduce((sum, v) => sum + (v === '' || Number.isNaN(Number(v)) ? 0 : Number(v)), 0), [scores]);

  const payload = () => ({ scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, v === '' ? null : Number(v)])), comments });

  const validate = (needAll) => {
    const found = {};
    for (const c of data.criteria) {
      const v = scores[c.id];
      if (v === '' || v === undefined) {
        if (needAll) found[c.id] = 'Enter a score';
      } else if (Number(v) < 0 || Number(v) > c.maxScore) found[c.id] = `Score must be between 0 and ${c.maxScore}`;
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  };

  const run = async (action, success) => {
    setSaving(true);
    try {
      await action();
      toast.success(success);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) setErrors(err.errors);
      toast.error(err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    if (!validate(false)) return;
    if (await run(() => judgingApi.saveEvaluation(eventId, teamId, payload()), 'Draft saved.')) reload();
  };

  const submit = async () => {
    setConfirming(false);
    if (await run(() => judgingApi.submitEvaluation(eventId, teamId, payload()), 'Evaluation submitted.')) navigate(`/judging/events/${eventId}`);
  };

  if (!data && loading) return <PageLoader />;
  if (error) return <LoadError error={error} onRetry={reload} />;
  const { team, criteria, evaluation, maxTotal } = data;

  return (
    <>
      <Link to={`/judging/events/${eventId}`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"><Icon name="arrow-left" className="h-4 w-4" />Assigned teams</Link>
      <PageHeader title={team.name} description={team.projectTitle || 'No project title yet'} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section aria-label="Project" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">Project</h2>
              <Badge tone={team.submittedAt ? 'green' : 'amber'}>{team.submittedAt ? 'Submitted' : 'Not submitted yet'}</Badge>
            </div>
            <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{team.projectDescription || 'The team has not described its project yet.'}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-slate-500">Repository</dt>
                <dd>{team.repositoryUrl ? <a href={team.repositoryUrl} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-indigo-600 hover:text-indigo-700">{team.repositoryUrl}</a> : <span className="text-slate-400">Not provided</span>}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Demo</dt>
                <dd>{team.demoUrl ? <a href={team.demoUrl} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-indigo-600 hover:text-indigo-700">{team.demoUrl}</a> : <span className="text-slate-400">Not provided</span>}</dd>
              </div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="text-base font-semibold text-slate-900">Team members</h2>
            <ul className="mt-2 text-sm text-slate-700">
              {team.members.map((m) => <li key={m.name}>{m.name}{m.role === 'leader' && <span className="text-xs text-slate-400"> (leader)</span>}</li>)}
            </ul>
          </Card>
        </section>

        <section aria-label="Your evaluation">
          <Card className="space-y-4 p-5 lg:sticky lg:top-24">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">Your evaluation</h2>
              <Badge tone={EVAL_STATUS[evaluation.status][0]}>{EVAL_STATUS[evaluation.status][1]}</Badge>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <p className="text-sm text-slate-500">Team</p>
              <p className="text-base font-semibold text-slate-900">{team.name}</p>
            </div>
            {locked && <Alert type="success">Submitted. Only the organizer can unlock it if a correction is needed.</Alert>}
            {evaluation.editUnlocked && evaluation.status === 'submitted' && <Alert type="info">The organizer allowed you to edit this evaluation. Re-submit when you are done.</Alert>}
            {criteria.length === 0 ? (
              <Alert type="info">Scoring opens once the organizer sets the criteria.</Alert>
            ) : (
              <>
                <div className="divide-y divide-slate-100 border-y border-slate-100">
                  {criteria.map((c) => (
                    <ScoreField key={c.id} criterion={c} value={scores[c.id] ?? ''} error={errors[c.id]} disabled={locked} onChange={(v) => { setScores((s) => ({ ...s, [c.id]: v })); setErrors((e) => ({ ...e, [c.id]: undefined })); }} />
                  ))}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">Total score</span>
                  <span className="text-lg font-semibold text-slate-900">{total} <span className="text-sm font-normal text-slate-500">/ {maxTotal}</span></span>
                </div>
                <Textarea label="Comments (private to organizers unless they choose to share)" rows={4} value={comments} disabled={locked} onChange={(e) => setComments(e.target.value)} />
                {!locked && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button variant="secondary" onClick={saveDraft} loading={saving} className="flex-1">Save draft</Button>
                    <Button onClick={() => validate(true) && setConfirming(true)} disabled={saving} className="flex-1">Submit evaluation</Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      <ConfirmDialog open={confirming} title="Submit this evaluation?" confirmLabel="Submit" loading={saving} onCancel={() => setConfirming(false)} onConfirm={submit}>
        <p>You are giving <strong className="text-slate-900">{team.name}</strong> a total of <strong className="text-slate-900">{total} / {maxTotal}</strong>. After submitting you cannot change it unless the organizer allows it.</p>
      </ConfirmDialog>
    </>
  );
}
