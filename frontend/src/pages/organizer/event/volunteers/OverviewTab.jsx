import { Link } from 'react-router-dom';
import { volunteerOpsApi } from '../../../../api';
import DepartmentCard from '../../../../components/volunteer/DepartmentCard.jsx';
import { buttonClasses } from '../../../../components/ui/Button.jsx';
import Alert from '../../../../components/ui/Alert.jsx';
import Card from '../../../../components/ui/Card.jsx';
import EmptyState from '../../../../components/ui/EmptyState.jsx';
import LoadError from '../../../../components/ui/LoadError.jsx';
import StatCard from '../../../../components/ui/StatCard.jsx';
import { useApi } from '../../../../hooks/useApi.js';
import { useEvent } from '../EventManageLayout.jsx';

/** The organizer's picture of the volunteer team: totals, each department, and what needs attention. */
export default function OverviewTab() {
  const { event } = useEvent();
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.overview(event.id, signal), [event.id], { refreshMs: 15000 });
  const applications = useApi((signal) => volunteerOpsApi.applications(event.id, signal), [event.id], { refreshMs: 30000 });

  if (error) return <LoadError error={error} onRetry={reload} />;
  const t = data?.totals;
  const pending = applications.data?.applications.filter((a) => a.status === 'pending').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total volunteers" value={t?.total} icon="users" tone="indigo" loading={!t} />
        <StatCard label="Assigned" value={t?.assigned} icon="check" tone="green" loading={!t} />
        <StatCard label="Unassigned" value={t?.unassigned} icon="user-plus" tone="amber" loading={!t} />
        <StatCard label="Checked in" value={t?.checkedIn} icon="qr" tone="sky" loading={!t} hint="today" />
        <StatCard label="Active now" value={t?.active} icon="zap" tone="green" loading={!t} hint="on duty" />
        <StatCard label="Tasks pending" value={t?.tasksPending} icon="clock" tone="amber" loading={!t} hint={t?.urgentTasks ? `${t.urgentTasks} urgent` : undefined} />
        <StatCard label="Tasks completed" value={t?.tasksCompleted} icon="award" tone="pink" loading={!t} />
        <StatCard label="Applications" value={applications.data ? pending : undefined} icon="inbox" tone="indigo" loading={!applications.data} hint="waiting for review" />
      </div>

      {data?.alerts.length > 0 && (
        <section aria-label="Needs attention" className="space-y-2">
          {data.alerts.map((a) => (
            <Alert key={a.key} type={a.severity === 'important' ? 'error' : 'info'}>{a.message}</Alert>
          ))}
        </section>
      )}

      {pending > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-700"><span className="font-bold text-slate-900">{pending} volunteer application{pending === 1 ? '' : 's'}</span> waiting for your decision.</p>
          <Link to="people" className={buttonClasses('primary', 'sm')}>Review applications</Link>
        </Card>
      )}

      <section aria-labelledby="dept-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="dept-heading" className="text-lg font-bold text-slate-900">Departments</h2>
          <Link to="departments" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Manage departments</Link>
        </div>
        {loading && !data ? (
          <div className="h-32 animate-pulse rounded-2xl bg-slate-200" aria-label="Loading departments" />
        ) : data.departments.length === 0 ? (
          <EmptyState icon="users" title="No departments yet" description="Create departments such as Registration or Technical Support and say how many volunteers each needs." action={<Link to="departments" className={buttonClasses('primary')}>Create a department</Link>} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.departments.map((d) => <li key={d.id}><DepartmentCard department={d} /></li>)}
          </ul>
        )}
      </section>
    </div>
  );
}
