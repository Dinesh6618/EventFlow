import { useState } from 'react';
import { ApiError, insightsApi } from '../../../api';
import RecommendationCard from '../../../components/insights/RecommendationCard.jsx';
import Alert from '../../../components/ui/Alert.jsx';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { PageLoader } from '../../../components/ui/Spinner.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useEvent } from './EventManageLayout.jsx';

const VIEWS = [
  { key: 'active', label: 'To review', match: (r) => r.status === 'new' },
  { key: 'handled', label: 'Done or dismissed', match: (r) => r.status === 'done' || r.status === 'dismissed' },
  { key: 'resolved', label: 'No longer applies', match: (r) => r.status === 'resolved' },
];

const EMPTY = {
  active: ['Nothing needs your attention', 'Your registration, attendance, schedule and team numbers look fine right now. This list refreshes every time you open it.'],
  handled: ['Nothing here yet', 'Recommendations you mark as done or dismiss will appear here.'],
  resolved: ['Nothing here yet', 'When the numbers improve and a recommendation no longer applies, it moves here automatically.'],
};

export default function InsightsPage() {
  const { event } = useEvent();
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => insightsApi.recommendations(event.id, signal), [event.id], { refreshMs: 60000 });
  const [view, setView] = useState('active');
  const [busyId, setBusyId] = useState(null);
  const [asking, setAsking] = useState(false);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoader label="Checking your event..." />;

  const all = data.recommendations;
  const counts = Object.fromEntries(VIEWS.map((v) => [v.key, all.filter(v.match).length]));
  const shown = all.filter(VIEWS.find((v) => v.key === view).match);
  const urgent = all.filter((r) => r.status === 'new' && r.severity === 'important').length;

  async function setStatus(item, status) {
    setBusyId(item.id);
    try {
      await insightsApi.setStatus(event.id, item.id, status);
      reload();
    } catch (err) {
      toast.error(err.message);
      if (err instanceof ApiError && err.status === 409) reload();
    } finally {
      setBusyId(null);
    }
  }

  async function askAi() {
    setAsking(true);
    try {
      const { added } = await insightsApi.askAi(event.id);
      toast.success(added ? `Added ${added} AI suggestion${added === 1 ? '' : 's'}.` : 'The AI had no further ideas based on the current numbers.');
      setView('active');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Recommendations</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Practical suggestions worked out from this event&apos;s own registrations, attendance, schedule, teams and feedback. You decide what to do; nothing is changed automatically.
          </p>
        </div>
        <div className="shrink-0">
          <Button onClick={askAi} loading={asking} disabled={!data.ai.configured}>
            <Icon name="sparkles" className="h-4 w-4" />
            Ask AI for more ideas
          </Button>
        </div>
      </div>

      {!data.ai.configured && (
        <Alert type="info">AI ideas are switched off because this server has no AI key set up. The recommendations below are still generated from your event data.</Alert>
      )}
      {urgent > 0 && (
        <Alert type="error">
          {urgent} recommendation{urgent === 1 ? ' needs' : 's need'} attention now.
        </Alert>
      )}

      <Tabs
        tabs={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] }))}
        value={view}
        onChange={setView}
        label="Recommendation status"
      />

      {shown.length === 0 ? (
        <EmptyState icon="sparkles" title={EMPTY[view][0]} description={EMPTY[view][1]} />
      ) : (
        <ul className="space-y-4" aria-label="Recommendations">
          {shown.map((item) => (
            <li key={item.id}>
              <RecommendationCard item={item} busy={busyId === item.id} onStatus={setStatus} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
