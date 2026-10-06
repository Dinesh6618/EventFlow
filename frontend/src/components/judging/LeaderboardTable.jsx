import { useState } from 'react';
import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

const STATUS_TONE = { Final: 'green', 'In progress': 'amber', 'Awaiting scores': 'slate', 'Not assigned': 'slate' };
const MEDAL = { 1: 'bg-amber-100 text-amber-800', 2: 'bg-slate-200 text-slate-700', 3: 'bg-orange-100 text-orange-800' };

export function RankBadge({ rank }) {
  if (!rank) return <span className="text-slate-400">-</span>;
  return (
    <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-semibold ${MEDAL[rank] ?? 'bg-slate-100 text-slate-600'}`}>
      {rank}
    </span>
  );
}

/**
 * Rank / Team / Score / Status. `detailed` rows (organizer) can be expanded to show per-criterion
 * averages and judge comments.
 */
export default function LeaderboardTable({ rows, maxScore, detailed = false, highlightTeamIds = [] }) {
  const [open, setOpen] = useState(null);

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="w-16 px-4 py-3">Rank</th>
              <th scope="col" className="px-4 py-3">Team</th>
              <th scope="col" className="px-4 py-3">Score</th>
              <th scope="col" className="px-4 py-3">Status</th>
              {detailed && <th scope="col" className="px-4 py-3"><span className="sr-only">Details</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.flatMap((row) => {
              const mine = highlightTeamIds.includes(row.teamId);
              const cells = (
                <tr key={row.teamId} className={mine ? 'bg-indigo-50/60' : ''}>
                  <td className="px-4 py-3"><RankBadge rank={row.rank} /></td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{row.team}{mine && <span className="ml-2 text-xs font-normal text-indigo-700">your team</span>}</p>
                    {detailed && row.projectTitle && <p className="text-xs text-slate-500">{row.projectTitle}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                    {row.score === null ? '-' : <><span className="font-semibold text-slate-900">{row.score}</span> / {maxScore}</>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[row.status] ?? 'slate'}>{row.status}</Badge>
                    {detailed && row.evaluationsAssigned > 0 && (
                      <span className="ml-2 text-xs text-slate-500">{row.evaluationsSubmitted}/{row.evaluationsAssigned} judges</span>
                    )}
                  </td>
                  {detailed && (
                    <td className="px-4 py-3 text-right">
                      <button type="button" aria-expanded={open === row.teamId} onClick={() => setOpen(open === row.teamId ? null : row.teamId)} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        {open === row.teamId ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  )}
                </tr>
              );
              if (!detailed || open !== row.teamId) return [cells];
              return [
                cells,
                <tr key={`${row.teamId}-detail`} className="bg-slate-50">
                  <td colSpan={5} className="px-4 py-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Average per criterion</p>
                        <ul className="space-y-1.5 text-sm">
                          {row.criteria.map((c) => (
                            <li key={c.id} className="flex items-center gap-3">
                              <span className="w-40 shrink-0 truncate text-slate-700">{c.name}</span>
                              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                                <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${(c.average / c.maxScore) * 100}%` }} />
                              </span>
                              <span className="w-16 text-right text-slate-600">{c.average} / {c.maxScore}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Judge comments (private)</p>
                        {row.comments.length ? (
                          <ul className="space-y-2 text-sm">
                            {row.comments.map((c, i) => (
                              <li key={i} className="rounded-lg bg-white p-3 text-slate-700 ring-1 ring-slate-200"><span className="font-medium">{c.judge}:</span> {c.comment}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-slate-500">No comments.</p>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
