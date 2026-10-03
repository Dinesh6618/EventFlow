import { useState } from 'react';
import { volunteerOpsApi } from '../../api';
import TaskCard from '../../components/volunteer/TaskCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useApi } from '../../hooks/useApi.js';

const TABS = [
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['completed', 'Completed'],
];

/** The volunteer's tasks, grouped by when they matter. */
export default function VolunteerTasksPage() {
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.myTasks(signal), [], { refreshMs: 20000 });
  const [tab, setTab] = useState('today');
  // Anything from an earlier day that was never finished still needs doing, so it shows under Today.
  const lists = data ? { today: [...data.overdue, ...data.today], upcoming: data.upcoming, completed: data.completed } : {};
  const shown = lists[tab] ?? [];

  return (
    <>
      <PageHeader eyebrow="Volunteer" title="My tasks" description="Accept a task, start it, and mark it complete when it is done." />
      <Tabs label="Task groups" value={tab} onChange={setTab} tabs={TABS.map(([key, label]) => ({ key, label, count: data ? lists[key].length : undefined }))} />
      <div className="mt-6">
        {!data && loading ? (
          <PageLoader />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : shown.length === 0 ? (
          <EmptyState icon="check" title={tab === 'completed' ? 'Nothing completed yet' : tab === 'today' ? 'No tasks for today' : 'No upcoming tasks'} description="When an organizer gives you a task it shows up here and you get a notification." />
        ) : (
          <ul className="space-y-4">{shown.map((t) => <li key={t.id}><TaskCard task={t} onChanged={reload} /></li>)}</ul>
        )}
      </div>
    </>
  );
}
