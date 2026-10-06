import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

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

const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** The latest check-ins (name and time). `items` is the `recent` list from the attendance dashboard. */
export function RecentCheckIns({ items = [] }) {
  return (
    <section aria-label="Recent check-ins">
      <h2 className="mb-2 text-base font-semibold text-slate-900">Recent check-ins</h2>
      <Card>
        {items.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((r) => (
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
          <p className="px-4 py-6 text-center text-sm text-slate-500">No check-ins yet. They appear here as soon as someone is scanned in.</p>
        )}
      </Card>
    </section>
  );
}

/** Registered, checked in and absent as three plain figures, with a thin progress bar. */
export default function AttendanceSummary({ summary, loading }) {
  // "Absent" is everyone entitled to attend who has not been checked in.
  const figures = [
    ['Registered', summary?.totalRegistered],
    ['Checked In', summary?.attended],
    ['Absent', summary?.notCheckedIn],
  ];

  return (
    <div>
      <Card>
        <dl className="grid grid-cols-3 divide-x divide-slate-200">
          {figures.map(([label, value]) => (
            <div key={label} className="px-4 py-4 sm:px-6">
              <dt className="text-sm text-slate-500">{label}</dt>
              {loading ? (
                <dd className="mt-1 h-8 w-12 animate-pulse rounded bg-slate-200" aria-label="Loading" />
              ) : (
                <dd className="mt-1 text-2xl font-semibold text-slate-900">{value ?? '-'}</dd>
              )}
            </div>
          ))}
        </dl>
      </Card>
      {summary && (
        <div className="mt-3" aria-label={`Attendance ${summary.attendancePercentage} percent`}>
          <div className="h-1.5 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full rounded bg-emerald-500 transition-all"
              style={{ width: `${summary.attendancePercentage}%` }}
              role="progressbar"
              aria-valuenow={summary.attendancePercentage}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {summary.attendancePercentage}% checked in. {summary.checkedIn} currently inside, {summary.checkedOut} checked out
            {summary.absent > 0 && `, ${summary.absent} marked absent`}
          </p>
        </div>
      )}
    </div>
  );
}
