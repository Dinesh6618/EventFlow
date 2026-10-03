import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, helpApi } from '../../api';
import { ItemStatusBadge, PriorityBadge, StatusBadge } from '../../components/help/HelpBadges.jsx';
import { timeAgo } from '../../components/notifications/NotificationBell.jsx';
import Button, { buttonClasses } from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Icon from '../../components/ui/Icon.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';

/** Help requests the organizer has handed to this volunteer. Nothing else is visible here. */
export default function VolunteerHelpPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => helpApi.assignedToMe(signal), [], { refreshMs: 15000 });
  const [busy, setBusy] = useState(null);

  const act = async (id, key, fn, success) => {
    setBusy(`${key}-${id}`);
    try {
      await fn();
      toast.success(success);
      reload();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const requests = data?.requests ?? [];

  return (
    <>
      <Link to="/volunteer" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <Icon name="arrow-left" className="h-4 w-4" />
        Volunteer
      </Link>
      <PageHeader eyebrow="Help Center" title="My assigned requests" description="Accept a request, update the participant, and mark it resolved when it is sorted." />

      {!data && loading ? (
        <PageLoader />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : requests.length === 0 ? (
        <EmptyState icon="shield" title="Nothing assigned to you" description="When the organizer assigns you a help request, it appears here and you get a notification." />
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => (
            <li key={r.id}>
              <Card className="p-5" data-testid="assigned-request">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-semibold text-slate-500">{r.requestCode}</p>
                    <h2 className="mt-0.5 flex items-center gap-2 text-lg font-bold text-slate-900"><span aria-hidden="true">{r.category.icon}</span>{r.category.name}</h2>
                    <p className="text-sm text-slate-500">{r.location} &middot; {r.eventName}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge priority={r.priority} />
                    <StatusBadge status={r.status} />
                    <ItemStatusBadge status={r.itemStatus} />
                  </div>
                </div>
                {r.description && <p className="mt-3 line-clamp-2 text-sm text-slate-700">{r.description}</p>}
                <p className="mt-2 text-xs text-slate-400">Reported by {r.participant.name} &middot; {timeAgo(r.createdAt)}</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {r.capabilities.canAccept && <Button loading={busy === `accept-${r.id}`} onClick={() => act(r.id, 'accept', () => helpApi.accept(r.id), 'You accepted the request.')}>Accept</Button>}
                  {r.capabilities.canStart && <Button variant={r.capabilities.canAccept ? 'secondary' : 'primary'} loading={busy === `start-${r.id}`} onClick={() => act(r.id, 'start', () => helpApi.setStatus(r.id, 'in_progress'), 'Marked as in progress.')}>Start work</Button>}
                  {r.capabilities.canResolve && r.status === 'in_progress' && <Button variant="secondary" loading={busy === `done-${r.id}`} onClick={() => act(r.id, 'done', () => helpApi.setStatus(r.id, 'resolved'), 'Marked as resolved.')}>Mark resolved</Button>}
                  <Link to={`/volunteer/help/${r.id}`} className={buttonClasses('secondary')}>Add update / details</Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
