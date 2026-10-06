import { feedbackApi } from '../../../api';
import Card from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Icon from '../../../components/ui/Icon.jsx';
import LoadError from '../../../components/ui/LoadError.jsx';
import StatCard from '../../../components/ui/StatCard.jsx';
import { useApi } from '../../../hooks/useApi.js';
import { formatDate } from '../../../utils/format.js';
import { useEvent } from './EventManageLayout.jsx';

const avg = (v) => (v === null ? '-' : v.toFixed(2));
const when = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function Stars({ value }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" className={`h-3.5 w-3.5 ${n <= value ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300'}`} />)}
    </span>
  );
}

export default function FeedbackPage() {
  const { event } = useEvent();
  const { data, error, loading, reload } = useApi((signal) => feedbackApi.summary(event.id, signal), [event.id], { refreshMs: 30000 });
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;
  if (data.responses === 0 && data.comments.length === 0 && data.sessions.every((s) => s.responses === 0)) {
    return <EmptyState icon="star" title="No feedback yet" description="Participants can rate the event and its sessions once they have finished. You will see averages, the rating spread and comments here." />;
  }

  const maxCount = Math.max(1, ...data.distribution.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Responses" value={`${data.responses} of ${data.eligible}`} icon="users" tone="indigo" />
        <StatCard label="Average rating" value={avg(data.averages.overall)} icon="star" tone="amber" />
        <StatCard label="Response rate" value={`${data.responseRate}%`} icon="dashboard" tone="indigo" />
        <StatCard label="Organization" value={avg(data.averages.organization)} icon="check" tone="green" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Rating distribution</h3>
          <ul className="mt-3 space-y-2" aria-label="Rating distribution">
            {data.distribution.map((d) => (
              <li key={d.rating} className="flex items-center gap-3 text-sm">
                <span className="w-14 shrink-0 text-slate-600">{d.rating} star{d.rating === 1 ? '' : 's'}</span>
                <span className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
                  <span className="block h-full rounded bg-indigo-500" style={{ width: `${(d.count / maxCount) * 100}%` }} />
                </span>
                <span className="w-8 text-right text-slate-600">{d.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Average by area</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[['Overall', data.averages.overall], ['Organization', data.averages.organization], ['Speakers', data.averages.speaker], ['Venue', data.averages.venue]].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-medium text-slate-900">{avg(value)} <span className="font-normal text-slate-400">/ 5</span></dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      {data.sessions.length > 0 && (
        <section aria-label="Session feedback">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Session-wise feedback</h3>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3">Session</th>
                    <th scope="col" className="px-4 py-3">Responses</th>
                    <th scope="col" className="px-4 py-3">Overall</th>
                    <th scope="col" className="px-4 py-3">Speaker</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3"><p className="font-medium text-slate-900">{s.title}</p><p className="text-xs text-slate-500">{formatDate(s.date)}{s.speaker ? ` - ${s.speaker}` : ''}</p></td>
                      <td className="px-4 py-3 text-slate-600">{s.responses}</td>
                      <td className="px-4 py-3 text-slate-700">{avg(s.overall)}</td>
                      <td className="px-4 py-3 text-slate-700">{avg(s.speakerRating)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      <section aria-label="Comments">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Comments and suggestions ({data.comments.length})</h3>
        {data.comments.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody has written a comment yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.comments.map((c) => (
              <li key={c.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="flex items-center gap-2"><Stars value={c.overall} />{c.sessionTitle ? `Session: ${c.sessionTitle}` : 'Whole event'}</span>
                    <span>{when(c.createdAt)} - anonymous</span>
                  </div>
                  {c.comments && <p className="mt-2 text-sm text-slate-800">{c.comments}</p>}
                  {c.suggestions && <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Suggestion:</span> {c.suggestions}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
