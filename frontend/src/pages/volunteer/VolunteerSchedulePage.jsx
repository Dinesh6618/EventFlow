import { volunteerOpsApi } from '../../api';
import DutyCard from '../../components/volunteer/DutyCard.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import LoadError from '../../components/ui/LoadError.jsx';
import PageHeader from '../../components/ui/PageHeader.jsx';
import { PageLoader } from '../../components/ui/Spinner.jsx';
import { useApi } from '../../hooks/useApi.js';
import { formatDate } from '../../utils/format.js';

/** Every duty the volunteer has, by day. */
export default function VolunteerSchedulePage() {
  const { data, error, loading, reload } = useApi((signal) => volunteerOpsApi.mySchedule(signal), [], { refreshMs: 30000 });
  const days = new Map();
  for (const a of data?.assignments ?? []) days.set(a.date, [...(days.get(a.date) ?? []), a]);

  return (
    <>
      <PageHeader eyebrow="Volunteer" title="My schedule" description="Your shifts, where to be and when." />
      {!data && loading ? (
        <PageLoader />
      ) : error ? (
        <LoadError error={error} onRetry={reload} />
      ) : days.size === 0 ? (
        <EmptyState icon="calendar" title="No shifts yet" description="When an organizer assigns you a shift it appears here." />
      ) : (
        <div className="space-y-8">
          {[...days.entries()].map(([date, duties]) => (
            <section key={date} aria-label={formatDate(date)}>
              <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-slate-500">{formatDate(date)}</h2>
              <ul className="space-y-3">{duties.map((d) => <li key={d.id}><DutyCard duty={d} onChanged={reload} /></li>)}</ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
