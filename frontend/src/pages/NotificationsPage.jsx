import { useState } from 'react';
import { Link } from 'react-router-dom';
import { notificationsApi } from '../api';
import { timeAgo } from '../components/notifications/NotificationBell.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadError from '../components/ui/LoadError.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { useApi } from '../hooks/useApi.js';

const PAGE = 20;

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [older, setOlder] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const { data, error, loading, reload } = useApi(
    (signal) => {
      setOlder([]);
      return notificationsApi.list({ unread: unreadOnly, limit: PAGE }, signal);
    },
    [unreadOnly],
    { refreshMs: 30000 },
  );

  const items = [...(data?.notifications ?? []), ...older];
  const canLoadMore = data && (older.length ? older.length % PAGE === 0 : data.notifications.length === PAGE);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const last = items[items.length - 1];
      const more = await notificationsApi.list({ unread: unreadOnly, limit: PAGE, before: last.id });
      setOlder((o) => [...o, ...more.notifications]);
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (n) => {
    if (!n.read) await notificationsApi.markRead(n.id).catch(() => {});
    reload();
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your events, registrations and schedule."
        action={
          <Button variant="secondary" disabled={!data?.unreadCount} onClick={async () => { await notificationsApi.markAllRead(); reload(); }}>
            Mark all as read
          </Button>
        }
      />
      <div role="group" aria-label="Filter" className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {[[false, 'All'], [true, `Unread${data ? ` (${data.unreadCount})` : ''}`]].map(([value, label]) => (
          <button key={label} type="button" aria-pressed={unreadOnly === value} onClick={() => setUnreadOnly(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${unreadOnly === value ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {!data && loading ? (
        <PageLoader />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : items.length === 0 ? (
        <EmptyState icon="inbox" title={unreadOnly ? 'No unread notifications' : 'No notifications yet'} description="We will let you know when something needs your attention." />
      ) : (
        <>
          <Card>
            <ul className="divide-y divide-slate-100">
              {items.map((n) => (
                <li key={n.id} className={`flex items-start gap-3 px-5 py-4 ${n.read ? '' : 'bg-indigo-50/40'}`}>
                  {!n.read ? <span aria-label="Unread" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-600" /> : <span className="mt-2 h-2 w-2 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{n.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      {timeAgo(n.createdAt)}
                      {n.link && <Link to={n.link} onClick={() => markRead(n)} className="font-medium text-indigo-600 hover:text-indigo-700">Open</Link>}
                      {!n.read && <button type="button" onClick={() => markRead(n)} className="font-medium text-slate-500 hover:text-slate-800">Mark as read</button>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {canLoadMore && (
            <div className="mt-4 text-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load older</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
