import { judgingApi } from '../../api';
import { useApi } from '../../hooks/useApi.js';
import Card from '../ui/Card.jsx';
import LoadError from '../ui/LoadError.jsx';
import LeaderboardTable from './LeaderboardTable.jsx';

/** What participants see once the organizer publishes results. Renders nothing before that. */
export default function LeaderboardPanel({ eventId }) {
  const { data, error, reload } = useApi((signal) => judgingApi.leaderboard(eventId, signal), [eventId], { refreshMs: 60000 });
  if (error) return error.status === 403 ? null : <LoadError error={error} onRetry={reload} />;
  if (!data?.published) return null;

  return (
    <section aria-label="Leaderboard">
      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">Leaderboard</h2>
      <LeaderboardTable rows={data.rows} maxScore={data.maxScore} highlightTeamIds={data.myTeamIds ?? []} />
      {data.feedback?.map((f) =>
        f.comments.length ? (
          <Card key={f.teamId} className="mt-4 p-5">
            <h3 className="text-sm font-semibold text-slate-900">Feedback from the judges</h3>
            <ul className="mt-2 space-y-2">
              {f.comments.map((c) => (
                <li key={c.judge} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-medium">{c.judge}:</span> {c.comment}</li>
              ))}
            </ul>
          </Card>
        ) : null,
      )}
    </section>
  );
}
