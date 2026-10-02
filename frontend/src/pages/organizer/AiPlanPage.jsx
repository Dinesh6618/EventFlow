import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, aiApi } from '../../api';
import PlanEditor, { PLAN_SECTIONS, cleanPlan } from '../../components/ai/PlanEditor.jsx';
import PlanStepper from '../../components/ai/PlanStepper.jsx';
import PublishModal from '../../components/ai/PublishModal.jsx';
import ScheduleSuggester from '../../components/ai/ScheduleSuggester.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

/** The five-step workflow for one plan: AI generated, review, edit, confirm, publish. */
export default function AiPlanPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => aiApi.get(id, signal), [id]);

  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');
  const [dialog, setDialog] = useState(null); // 'confirm' | 'publish' | 'delete'

  const server = data?.plan;
  // Reset the working copy whenever the saved plan changes.
  useEffect(() => {
    if (server) {
      setDraft(clone(server.plan));
      setErrors({});
    }
  }, [server?.id, server?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = useMemo(() => Boolean(server && draft) && JSON.stringify(draft) !== JSON.stringify(server.plan), [server, draft]);

  if (!data && loading) return <PageLoader label="Loading plan..." />;
  if (error?.status === 404) return <p className="text-slate-600">Plan not found. <Link to="/organizer/ai-planner" className="font-medium text-indigo-600">Back to the planner</Link></p>;
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!server || !draft) return null;

  const published = server.status === 'published';
  const confirmed = server.status === 'confirmed';
  const errorCount = Object.keys(errors).length;

  const run = async (name, action, success) => {
    setBusy(name);
    try {
      const result = await action();
      if (success) toast.success(success);
      return result;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors) {
        setErrors(err.errors);
        toast.error(`${Object.keys(err.errors).length} thing${Object.keys(err.errors).length === 1 ? '' : 's'} to fix in the plan.`);
      } else {
        toast.error(err.message);
      }
      return null;
    } finally {
      setBusy('');
      setDialog(null);
    }
  };

  const save = async () => {
    const result = await run('save', () => aiApi.save(id, cleanPlan(draft)), confirmed ? 'Saved. The plan is a draft again, so confirm it once more.' : 'Changes saved.');
    if (result) reload();
  };
  const confirm = async () => {
    if (await run('confirm', () => aiApi.confirm(id), 'Plan confirmed. You can publish it now.')) reload();
  };
  const remove = async () => {
    if ((await run('delete', () => aiApi.remove(id), 'Plan discarded.')) !== null) navigate('/organizer/ai-planner');
  };

  return (
    <>
      <Link to="/organizer/ai-planner" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        AI planner
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{server.plan.title}</h1>
            <Badge tone={published ? 'green' : confirmed ? 'indigo' : 'amber'}>{published ? 'Published' : confirmed ? 'Confirmed' : 'Draft'}</Badge>
          </div>
          <p className="mt-1 max-w-3xl truncate text-sm text-slate-500">"{server.request.idea}"</p>
        </div>
        {published && server.eventId && <Link to={`/organizer/events/${server.eventId}`} className={buttonClasses('primary')}>Open the event</Link>}
      </div>

      <Card className="mb-6 p-4"><PlanStepper status={server.status} dirty={dirty} /></Card>

      {published ? (
        <Alert type="success" className="mb-6">This plan was published as an event. It is kept here as a record of how the event was planned, and can no longer be edited.</Alert>
      ) : (
        <Alert type="info" className="mb-6">
          <p className="font-medium">AI-generated draft: please review it before using it.</p>
          <p className="mt-0.5 text-sm">The AI can make mistakes or miss local constraints. Nothing is created until you confirm the plan and publish it as an event.</p>
        </Alert>
      )}

      {server.warnings.length > 0 && !published && (
        <Alert type="error" className="mb-6">
          <p className="font-medium">Worth a look</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{server.warnings.map((w) => <li key={`${w.path}-${w.message}`}>{w.message}</li>)}</ul>
        </Alert>
      )}
      {errorCount > 0 && <Alert type="error" className="mb-6">Fix the {errorCount} highlighted field{errorCount === 1 ? '' : 's'} below, then save again.</Alert>}

      <nav aria-label="Plan sections" className="sticky top-0 z-20 -mx-4 mb-8 overflow-x-auto border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0 lg:top-0">
        <ul className="flex gap-1 whitespace-nowrap">
          {PLAN_SECTIONS.map(([key, label]) => (
            <li key={key}><a href={`#${key}`} className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white hover:text-slate-900">{label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="pb-28">
        {!published && (
          <div className="mb-8">
            <ScheduleSuggester planId={id} plan={draft} disabled={Boolean(busy)} onUse={(schedule) => { setDraft((d) => ({ ...d, schedule })); toast.success('Suggested schedule added to your draft. Review it, then save.'); }} />
          </div>
        )}
        <PlanEditor plan={draft} onChange={setDraft} errors={errors} readOnly={published} />
      </div>

      {!published && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 lg:px-6">
            <p role="status" className="text-sm text-slate-600">
              {dirty ? 'You have unsaved changes.' : confirmed ? 'Confirmed. Ready to publish.' : 'Saved. Confirm when you are happy with the plan.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDialog('delete')} disabled={Boolean(busy)}>Discard plan</Button>
              <Button variant="secondary" onClick={save} loading={busy === 'save'} disabled={!dirty}>Save changes</Button>
              {confirmed && !dirty ? (
                <Button onClick={() => setDialog('publish')}>Publish as event</Button>
              ) : (
                <Button onClick={() => setDialog('confirm')} disabled={dirty || Boolean(busy)} title={dirty ? 'Save your changes first' : undefined}>Confirm plan</Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog open={dialog === 'confirm'} title="Confirm this plan?" confirmLabel="Confirm plan" loading={busy === 'confirm'} onCancel={() => setDialog(null)} onConfirm={confirm}>
        <p>You are saying you have reviewed the plan and it is ready to become an event. Nothing is created yet: the next step is Publish, where you add the date and venue. If you edit the plan again, you will need to confirm it again.</p>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'delete'} title="Discard this plan?" confirmLabel="Discard" danger loading={busy === 'delete'} onCancel={() => setDialog(null)} onConfirm={remove}>
        <p>The draft and your edits will be deleted. This does not affect any event.</p>
      </ConfirmDialog>

      {dialog === 'publish' && (
        <PublishModal plan={server} onClose={() => setDialog(null)} onPublished={(event) => navigate(`/organizer/events/${event.id}`)} />
      )}
    </>
  );
}
