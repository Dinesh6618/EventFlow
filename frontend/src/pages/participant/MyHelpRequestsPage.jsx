import { useState } from 'react';
import { Link } from 'react-router-dom';
import { helpApi } from '../../api';
import { ItemStatusBadge, PriorityBadge, StatusBadge } from '../../components/help/HelpBadges.jsx';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';
import { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import Tabs from '../../components/ui/Tabs.jsx';
import { useApi } from '../../hooks/useApi.js';

const DONE = ['resolved', 'closed', 'cancelled'];

export function HelpRequestCard({ request: r, to }) {
  return (
    <Card hover className="p-5" data-testid="help-request">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-slate-500">{r.requestCode}</p>
          <h3 className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900"><span aria-hidden="true">{r.category.icon}</span>{r.category.name}</h3>
          <p className="text-sm text-slate-500">{r.location} &middot; {r.eventName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status} />
          <PriorityBadge priority={r.priority} />
          <ItemStatusBadge status={r.itemStatus} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-slate-600">
          {r.assignedTo ? <>Assigned: <span className="font-semibold text-slate-900">{r.assignedTo.team ?? 'Event team'}</span></> : 'Waiting to be assigned'}
          <span className="text-slate-400"> &middot; opened {timeAgo(r.createdAt)}</span>
        </p>
        <Link to={to} className={buttonClasses('secondary', 'sm')}>View details</Link>
      </div>
    </Card>
  );
}

/** Everything the signed-in student has asked help for, newest first. */
export default function MyHelpRequestsPage() {
  const { data, error, loading, reload } = useApi((signal) => helpApi.mine(signal), [], { refreshMs: 20000 });
  const [tab, setTab] = useState('active');

  const all = data?.requests ?? [];
  const active = all.filter((r) => !DONE.includes(r.status));
  const past = all.filter((r) => DONE.includes(r.status));
  const shown = tab === 'active' ? active : past;

  return (
    <>
      <PageHeader eyebrow="Help Center" title="My Help Requests" description="Follow your requests and read updates from the event team." action={<Link to="/help" className={buttonClasses('primary')}>Get help</Link>} />
      <Tabs label="Request state" value={tab} onChange={setTab} tabs={[{ key: 'active', label: 'Active', count: data ? active.length : undefined }, { key: 'past', label: 'Resolved & closed', count: data ? past.length : undefined }]} />
      <div className="mt-6">
        {!data && loading ? (
          <PageLoader />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : shown.length === 0 ? (
          <EmptyState icon="shield" title={tab === 'active' ? 'No active requests' : 'Nothing here yet'} description={tab === 'active' ? 'If you need help during an event, use Get help and it will appear here.' : 'Requests that were resolved, closed or cancelled show up here.'} />
        ) : (
          <ul className="space-y-4">{shown.map((r) => <li key={r.id}><HelpRequestCard request={r} to={`/help/requests/${r.id}`} /></li>)}</ul>
        )}
      </div>
    </>
  );
}
