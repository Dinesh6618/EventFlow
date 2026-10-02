import { useState } from 'react';
import { notificationsApi } from '../api';
import NotificationItem, { kindOf } from '../components/notifications/NotificationItem.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import LoadError from '../components/ui/LoadError.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import { useApi } from '../hooks/useApi.js';

const PAGE = 20;

const EMPTY = {
  all: ['No notifications yet', 'We will let you know when something needs your attention.'],
  unread: ['You are all caught up', 'There is nothing unread.'],
  updates: ['No event updates', 'Announcements, schedule changes, team activity and certificates show up here.'],
  reminders: ['No reminders', 'Event, session and feedback reminders show up here.'],
};

export default function NotificationsPage() {
  const [tab, setTab] = useState('all');
  const [older, setOlder] = useState([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const unreadOnly = tab === 'unread';
  const { data, error, loading, reload } = useApi(
    (signal) => {
      setOlder([]);
      return notificationsApi.list({ unread: unreadOnly, limit: PAGE }, signal);
    },
    [unreadOnly],
    { refreshMs: 30000 },
  );

  const loaded = [...(data?.notifications ?? []), ...older];
  const items = loaded.filter((n) => (tab === 'updates' || tab === 'reminders' ? kindOf(n.type).group === tab : true));
  const canLoadMore = data && (older.length ? older.length % PAGE === 0 : data.notifications.length === PAGE);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const last = loaded[loaded.length - 1];
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
        eyebrow="Inbox"
        title="Notifications"
        description="Updates about your events, registrations and schedule."
        action={
          <Button variant="secondary" disabled={!data?.unreadCount} onClick={async () => { await notificationsApi.markAllRead(); reload(); }}>
            Mark all as read
          </Button>
        }
      />

      <Tabs
        label="Notification categories"
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'unread', label: 'Unread', count: data?.unreadCount },
          { key: 'updates', label: 'Event Updates' },
          { key: 'reminders', label: 'Reminders' },
        ]}
      />

      <div className="mt-6">
        {!data && loading ? (
          <PageLoader />
        ) : error ? (
          <LoadError error={error} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title={EMPTY[tab][0]} description={EMPTY[tab][1]} />
        ) : (
          <>
            <Card className="overflow-hidden">
              <ul className="divide-y divide-slate-100">
                {items.map((n) => <NotificationItem key={n.id} notification={n} onRead={markRead} />)}
              </ul>
            </Card>
            {canLoadMore && (
              <div className="mt-4 text-center">
                <Button variant="secondary" onClick={loadMore} loading={loadingMore}>Load older</Button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
