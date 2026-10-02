import { Link } from 'react-router-dom';
import { aiApi } from '../../../api';
import PlanEditor from '../../../components/ai/PlanEditor.jsx';
import Alert from '../../../components/ui/Alert.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { buttonClasses } from '../../../components/ui/Button.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { useEvent } from './EventManageLayout.jsx';

/** The AI plan this event was published from: checklists for volunteers, resources, messages and risks. */
export default function AiPlanTab() {
  const { event } = useEvent();
  const { data, error, loading, reload } = useApi((signal) => aiApi.forEvent(event.id, signal), [event.id]);
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;

  if (!data.plan) {
    return (
      <EmptyState
        icon="sparkles"
        title="This event was not planned with AI"
        description="Events published from an AI plan keep their plan here: volunteer roles, resources, the communication plan and the risk checklist."
        action={<Link to="/organizer/ai-planner" className={buttonClasses('primary')}>Plan an event with AI</Link>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Alert type="info">
        Planned with AI on {new Date(data.plan.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })} and reviewed by you.{' '}
        <Link to={`/organizer/ai-planner/${data.plan.id}`} className="font-medium underline">Open the original plan</Link>
      </Alert>
      <PlanEditor plan={data.plan.plan} onChange={() => {}} readOnly />
    </div>
  );
}
