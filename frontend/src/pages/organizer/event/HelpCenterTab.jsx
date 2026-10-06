import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, helpApi } from '../../../api';
import HelpAnalytics from '../../../components/help/HelpAnalytics.jsx';
import { PriorityBadge, StatusBadge } from '../../../components/help/HelpBadges.jsx';
import Alert from '../../../components/ui/Alert.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import Button, { buttonClasses } from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import { useToast } from '../../../context/ToastContext.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { durationText } from '../../../utils/help.js';
import { useEvent } from './EventManageLayout.jsx';

const FILTERS = [
  { key: 'active', label: 'All active', query: { state: 'active' } },
  { key: 'open', label: 'Open', query: { state: 'open' } },
  { key: 'urgent', label: 'Urgent', query: { state: 'active', priority: 'urgent' } },
  { key: 'in_progress', label: 'In progress', query: { status: 'in_progress' } },
  { key: 'resolved', label: 'Resolved', query: { status: 'resolved' } },
  { key: 'all', label: 'Everything', query: {} },
];

/** The organizer's live help desk for one event. */
export default function HelpCenterTab() {
  const { event } = useEvent();
  const toast = useToast();
  const [section, setSection] = useState('requests');
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState(null);

  const current = FILTERS.find((f) => f.key === filter);
  const { data, error, loading, reload } = useApi((signal) => helpApi.forEvent(event.id, current.query, signal), [event.id, filter], { refreshMs: 10000 });
  const analytics = useApi((signal) => (section === 'reports' ? helpApi.analytics(event.id, signal) : Promise.resolve(null)), [event.id, section]);

  const acknowledge = async (r) => {
    setBusy(r.id);
    try {
      await helpApi.setStatus(r.id, 'acknowledged');
      toast.success(`${r.requestCode} acknowledged.`);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the request.');
    } finally {
      setBusy(null);
    }
  };

  const s = data?.summary;
  const requests = data?.requests ?? [];
  const alarms = requests.filter((r) => r.escalated && !['resolved', 'closed', 'cancelled'].includes(r.status));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open requests" value={s?.open} icon="inbox" tone="indigo" loading={!s} hint="waiting for a response" />
        <StatCard label="Urgent" value={s?.urgent} icon="alert" tone="amber" loading={!s} />
        <StatCard label="In progress" value={s?.inProgress} icon="clock" tone="indigo" loading={!s} />
        <StatCard label="Resolved" value={s?.resolved} icon="check" tone="green" loading={!s} />
      </div>

      {alarms.map((r) => (
        <Alert key={r.id} type="error" action={<Link to={`/organizer/help/${r.id}?event=${event.id}`} className={buttonClasses('secondary', 'sm')}>View request</Link>}>
          <p className="font-semibold">Escalation: {r.requestCode}</p>
          <p>{r.priority === 'urgent' ? 'Urgent' : 'This'} request needs attention: {r.category.name} at {r.location}.</p>
        </Alert>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label="Help Center sections" value={section} onChange={setSection} tabs={[{ key: 'requests', label: 'Requests' }, { key: 'reports', label: 'Reports' }]} />
        <p className="text-xs text-slate-500">Updates every 10 seconds. EventFlow does not contact emergency services.</p>
      </div>

      {section === 'reports' ? (
        analytics.error ? <LoadError error={analytics.error} onRetry={analytics.reload} /> : analytics.data ? <HelpAnalytics data={analytics.data} /> : <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading reports" />
      ) : (
        <>
          <div role="group" aria-label="Filter requests" className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${filter === f.key ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>
            ))}
          </div>

          {error ? (
            <LoadError error={error} onRetry={reload} />
          ) : !data && loading ? (
            <div className="h-40 animate-pulse rounded-lg bg-slate-200" aria-label="Loading requests" />
          ) : requests.length === 0 ? (
            <EmptyState icon="shield" title="No requests here" description={filter === 'active' ? 'When a participant asks for help during the event, it appears here straight away.' : 'Try another filter.'} />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Request</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="hidden px-4 py-3 md:table-cell">Participant</th>
                      <th scope="col" className="px-4 py-3">Location</th>
                      <th scope="col" className="px-4 py-3">Priority</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="hidden px-4 py-3 lg:table-cell">Assigned to</th>
                      <th scope="col" className="hidden px-4 py-3 sm:table-cell">Time</th>
                      <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {requests.map((r) => (
                      <tr key={r.id} className={r.priority === 'urgent' && !['resolved', 'closed', 'cancelled'].includes(r.status) ? 'bg-red-50/40' : ''}>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-slate-700">{r.requestCode.replace('HELP-', '')}</td>
                        <td className="whitespace-nowrap px-4 py-3"><span aria-hidden="true">{r.category.icon}</span> {r.category.name}</td>
                        <td className="hidden px-4 py-3 md:table-cell">{r.participant.name}</td>
                        <td className="px-4 py-3">{r.location}</td>
                        <td className="whitespace-nowrap px-4 py-3"><PriorityBadge priority={r.priority} />{r.escalated && <Badge tone="red" className="ml-1">Escalated</Badge>}</td>
                        <td className="whitespace-nowrap px-4 py-3"><StatusBadge status={r.status} />{r.overdue && <span className="ml-1.5 text-xs font-semibold text-amber-700">overdue</span>}</td>
                        <td className="hidden px-4 py-3 lg:table-cell">{r.assignedTo?.name ?? <span className="text-slate-400">-</span>}</td>
                        <td className="hidden whitespace-nowrap px-4 py-3 text-slate-500 sm:table-cell">{durationText(r.ageMinutes)} ago</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {r.capabilities.canAcknowledge && <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => acknowledge(r)}>Acknowledge</Button>}{' '}
                          <Link to={`/organizer/help/${r.id}?event=${event.id}`} className={buttonClasses('primary', 'sm')}>View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
