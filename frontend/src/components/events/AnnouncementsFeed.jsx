import { announcementsApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import Card from '../ui/Card.jsx';

/** Organizer announcements, shown to participants who hold a seat. Renders nothing when there are none. */
export default function AnnouncementsFeed({ eventId }) {
  const { data } = useApi((signal) => announcementsApi.list(eventId, signal), [eventId], { refreshMs: 60000 });
  if (!data?.announcements.length) return null;

  return (
    <section aria-label="Announcements" className="mb-6">
      <h2 className="mb-3 text-lg font-semibold text-slate-900">Announcements</h2>
      <ul className="space-y-3">
        {data.announcements.map((a) => (
          <li key={a.id}>
            <Card className="p-4">
              <p className="font-medium text-slate-900">{a.title}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.message}</p>
              <p className="mt-2 text-xs text-slate-400">{new Date(a.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
