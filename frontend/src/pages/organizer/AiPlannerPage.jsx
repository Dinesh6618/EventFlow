import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, aiApi } from '../../api';
import Alert from '../../components/ui/Alert.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { Input, Select, Textarea } from '../../components/ui/FormField.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { useApi } from '../../hooks/useApi.js';
import { EVENT_TYPES } from '../../utils/constants.js';

const EXAMPLE = 'I want to conduct a 24-hour AI hackathon for 300 students.';
const STATUS = { draft: ['amber', 'Draft'], confirmed: ['indigo', 'Confirmed'], published: ['green', 'Published'] };
const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function AiPlannerPage() {
  const navigate = useNavigate();
  const status = useApi((signal) => aiApi.status(signal));
  const { data, error, loading, reload } = useApi((signal) => aiApi.list(signal));
  const [values, setValues] = useState({ idea: '', eventType: '', expectedParticipants: '', durationHours: '', startTime: '', sessionCount: '', breakMinutes: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [generating, setGenerating] = useState(false);

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const generate = async (e) => {
    e.preventDefault();
    setFormError('');
    if (values.idea.trim().length < 10) {
      setErrors({ idea: 'Describe the event in a sentence or two (at least 10 characters)' });
      return;
    }
    setGenerating(true);
    try {
      const body = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v).trim() !== ''));
      const { plan } = await aiApi.generate(body);
      navigate(`/organizer/ai-planner/${plan.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.errors && Object.keys(err.errors).length) setErrors(err.errors);
      setFormError(err.message);
      setGenerating(false);
      reload();
    }
  };

  const configured = status.data?.configured;

  return (
    <>
      <PageHeader title="AI Event Planner" description="Describe your event and get a draft plan to review, edit and approve. Nothing is created until you publish it." />

      {status.data && !configured && (
        <Alert type="info" className="mb-6">
          <p className="font-medium">The AI planner is not set up on this server.</p>
          <p className="mt-0.5 text-sm">An administrator needs to set <code className="rounded bg-white/60 px-1">ANTHROPIC_API_KEY</code> in the backend settings. You can still open plans created earlier.</p>
        </Alert>
      )}

      <Card className="mb-8 p-5">
        <form onSubmit={generate} noValidate className="space-y-5">
          <Textarea
            label="What do you want to organise?"
            required
            rows={4}
            value={values.idea}
            onChange={set('idea')}
            error={errors.idea}
            placeholder={EXAMPLE}
            maxLength={2000}
            hint="The more you say about your goals, audience and constraints, the better the draft."
          />
          <details className="rounded-lg border border-slate-200 px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Optional details (guide the schedule)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select label="Event type" options={EVENT_TYPES} placeholder="Let the AI choose" value={values.eventType} onChange={set('eventType')} error={errors.eventType} />
              <Input label="Expected participants" type="number" min="1" value={values.expectedParticipants} onChange={set('expectedParticipants')} error={errors.expectedParticipants} />
              <Input label="Duration (hours)" type="number" min="0.5" value={values.durationHours} onChange={set('durationHours')} error={errors.durationHours} />
              <Input label="Start time on day 1" type="time" value={values.startTime} onChange={set('startTime')} error={errors.startTime} />
              <Input label="Number of sessions" type="number" min="1" value={values.sessionCount} onChange={set('sessionCount')} error={errors.sessionCount} />
              <Input label="Break length (minutes)" type="number" min="5" value={values.breakMinutes} onChange={set('breakMinutes')} error={errors.breakMinutes} />
            </div>
          </details>
          {formError && <Alert type="error">{formError}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" loading={generating} disabled={status.data && !configured}>
              <Icon name="sparkles" className="h-4 w-4" />
              {generating ? 'Drafting your plan...' : 'Draft a plan with AI'}
            </Button>
            {generating && <p role="status" className="text-sm text-slate-500">This usually takes under a minute.</p>}
          </div>
        </form>
      </Card>

      <section aria-label="Your plans">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your plans</h2>
        {error ? (
          <LoadError error={error} onRetry={reload} />
        ) : !data && loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-slate-200" aria-label="Loading plans" />
        ) : data.plans.length === 0 ? (
          <EmptyState icon="sparkles" title="No plans yet" description="Describe an event above and the AI will draft a schedule, team rules, judging criteria, volunteers and a risk checklist." />
        ) : (
          <Card>
            <ul className="divide-y divide-slate-100">
              {data.plans.map((p) => (
                <li key={p.id}>
                  <Link to={`/organizer/ai-planner/${p.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{p.title}</span>
                      <span className="block truncate text-xs text-slate-500">{p.eventType} - {when(p.createdAt)} - {p.idea}</span>
                    </span>
                    <Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </>
  );
}
