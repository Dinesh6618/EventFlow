import Badge from '../ui/Badge.jsx';
import StatCard from '../ui/StatCard.jsx';

const STATES = {
  registered: ['slate', 'Registered'],
  checked_in: ['green', 'Checked in'],
  checked_out: ['indigo', 'Checked out'],
  absent: ['red', 'Absent'],
};

export function AttendanceBadge({ state }) {
  const [tone, label] = STATES[state] || ['slate', state];
  return <Badge tone={tone}>{label}</Badge>;
}

/** The four headline numbers plus a progress bar. */
export default function AttendanceSummary({ summary, loading }) {
  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total registered" value={summary?.totalRegistered} icon="users" tone="indigo" loading={loading} />
        <StatCard label="Checked in" value={summary?.attended} icon="check" tone="green" loading={loading} />
        <StatCard label="Not checked in" value={summary?.notCheckedIn} icon="clock" tone="amber" loading={loading} />
        <StatCard label="Attendance" value={summary ? `${summary.attendancePercentage}%` : ''} icon="dashboard" tone="sky" loading={loading} />
      </div>
      {summary && (
        <div className="mt-4" aria-label={`Attendance ${summary.attendancePercentage} percent`}>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${summary.attendancePercentage}%` }}
              role="progressbar"
              aria-valuenow={summary.attendancePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {summary.checkedIn} currently inside, {summary.checkedOut} checked out
            {summary.absent > 0 && `, ${summary.absent} absent`}
          </p>
        </div>
      )}
    </div>
  );
}
