import { attendanceApi, scheduleApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import { todayISO } from '../../utils/format.js';
import LoadError from '../ui/LoadError.jsx';
import AttendanceSummary, { RecentCheckIns } from './AttendanceSummary.jsx';
import Scanner from './Scanner.jsx';

/** Scanner plus live counts and the latest check-ins. Used by organizers and volunteers. */
export default function ScanPanel({ eventId }) {
  const { data, error, loading, reload } = useApi((signal) => attendanceApi.dashboard(eventId, {}, signal), [eventId], {
    refreshMs: 10000,
  });

  const todaySessions = useApi((signal) => scheduleApi.list(eventId, signal), [eventId]).data?.items.filter((i) => i.date === todayISO() && i.sessionType !== 'break') ?? [];

  if (error) return <LoadError error={error} onRetry={reload} />;

  return (
    <div className="space-y-6">
      <AttendanceSummary summary={data?.summary} loading={!data && loading} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Scanner eventId={eventId} sessions={todaySessions} onRecorded={reload} />
        <RecentCheckIns items={data?.recent} />
      </div>
    </div>
  );
}
