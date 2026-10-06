import { volunteerOpsApi } from '../../../../api';
import VolunteerAnalytics from '../../../../components/volunteer/VolunteerAnalytics.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useEvent } from '../EventManageLayout.jsx';

export default function AnalyticsTab() {
  const { event } = useEvent();
  const { data, error, reload } = useApi((signal) => volunteerOpsApi.analytics(event.id, signal), [event.id], { refreshMs: 30000 });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data) return <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading analytics" />;
  return <VolunteerAnalytics data={data} />;
}
