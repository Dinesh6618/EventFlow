import { attendanceApi, scheduleApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { todayISO } from '../../utils/format.js';
import Card from '../ui/Card.jsx';
import LoadError from '../ui/LoadError.jsx';
import AttendanceSummary from './AttendanceSummary.jsx';
import Scanner from './Scanner.jsx';

const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** Scanner plus live counts and the latest check-ins. Used by organizers and volunteers. */
export default function ScanPanel({ eventId }) {
  const { data, error, loading, reload } = useApi((signal) => attendanceApi.dashboard(eventId, {}, signal), [eventId], {
    refreshMs: 10000,
  });

  const todaySessions = useApi((signal) => scheduleApi.list(eventId, signal), [eventId]).data?.items.filter((i) => i.date === todayISO() && i.sessionType !== 'break') ?? [];

  if (error) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="space-y-8">
      <AttendanceSummary summary={data?.summary} loading={!data && loading} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Scanner eventId={eventId} sessions={todaySessions} onRecorded={reload} />
        <section aria-label="Latest check-ins">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Latest activity</h2>
          <Card>
            {data?.recent.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {data.recent.map((r) => (
                  <li key={`${r.participantCode}-${r.at}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900">{r.name}</span>
                      <span className="text-xs text-slate-500">{r.status === 'checked_out' ? 'Checked out' : 'Checked in'}</span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{clock(r.at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-slate-500">No check-ins yet.</p>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
