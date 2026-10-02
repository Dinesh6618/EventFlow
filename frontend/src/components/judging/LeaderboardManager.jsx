import { useEffect, useState } from 'react';
import { judgingApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import Alert from '../ui/Alert.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { Checkbox } from '../ui/FormField.jsx';
import LoadError from '../ui/LoadError.jsx';
import LeaderboardTable from './LeaderboardTable.jsx';

/** Organizer's leaderboard: full detail, plus publish/unpublish and comment sharing. */
export default function LeaderboardManager({ event, onChanged }) {
  const toast = useToast();
  const { data, error, loading, reload } = useApi((signal) => judgingApi.leaderboard(event.id, signal), [event.id], { refreshMs: 15000 });
  const [confirm, setConfirm] = useState(null); // 'publish' | 'unpublish'
  const [busy, setBusy] = useState(false);
  // Shown immediately; dropped once the server confirms (or the save fails).
  const [pendingShare, setPendingShare] = useState(null);

  const update = async (patch, message) => {
    setBusy(true);
    try {
      await judgingApi.settings(event.id, { leaderboardPublished: data.published, shareJudgeComments: data.shareJudgeComments, ...patch });
      toast.success(message);
      reload();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
      setPendingShare(null);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // Once the refreshed data agrees with what the checkbox shows, stop overriding it.
  useEffect(() => {
    if (pendingShare !== null && data?.shareJudgeComments === pendingShare) setPendingShare(null);
  }, [data?.shareJudgeComments, pendingShare]);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (!data && loading) return null;

  const incomplete = data.rows.some((r) => r.status !== 'Final');

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900">Visibility</h3>
              <Badge tone={data.published ? 'green' : 'slate'}>{data.published ? 'Published' : 'Private'}</Badge>
            </div>
            <p className="mt-1 max-w-xl text-sm text-slate-500">
              Only you see the leaderboard until you publish it. Participants then see rank, team, score and status. Judges' comments stay private unless you share them below.
            </p>
          </div>
          {data.published ? (
            <Button variant="secondary" onClick={() => setConfirm('unpublish')}>Unpublish</Button>
          ) : (
            <Button onClick={() => setConfirm('publish')} disabled={data.rows.every((r) => r.score === null)}>Publish leaderboard</Button>
          )}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Checkbox
            label="Share judges' comments with each team"
            hint="Each team sees only its own comments, anonymised as Judge 1, Judge 2 and so on."
            checked={pendingShare ?? data.shareJudgeComments}
            disabled={busy}
            onChange={(e) => {
              setPendingShare(e.target.checked);
              update({ shareJudgeComments: e.target.checked }, e.target.checked ? "Teams can now see their judges' comments." : "Judges' comments are private again.");
            }}
          />
        </div>
      </Card>

      {data.rows.length === 0 ? (
        <EmptyState icon="users" title="No teams yet" description="The leaderboard fills in as teams are created and judges submit scores." />
      ) : (
        <>
          {incomplete && !data.published && <Alert type="info">Some teams are not fully scored yet. You can still publish; rankings update as more evaluations arrive.</Alert>}
          <LeaderboardTable rows={data.rows} maxScore={data.maxScore} detailed />
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm === 'publish' ? 'Publish the leaderboard?' : 'Unpublish the leaderboard?'}
        confirmLabel={confirm === 'publish' ? 'Publish' : 'Unpublish'}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() =>
          confirm === 'publish'
            ? update({ leaderboardPublished: true }, 'Leaderboard published. Registered participants were notified.')
            : update({ leaderboardPublished: false }, 'Leaderboard is private again.')
        }
      >
        <p>{confirm === 'publish' ? 'Everyone registered for the event will be able to see the rankings and be notified.' : 'Participants will no longer see the rankings.'}</p>
      </ConfirmDialog>
    </div>
  );
}
