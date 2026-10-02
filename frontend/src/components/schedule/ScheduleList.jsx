import Badge from '../ui/Badge.jsx';
import Icon from '../ui/Icon.jsx';
import { SESSION_TYPES } from '../../utils/constants.js';
import { formatDate, formatTime } from '../../utils/format.js';

export function SessionTypeBadge({ type }) {
  const info = SESSION_TYPES[type] || SESSION_TYPES.session;
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

function groupByDate(items) {
  const groups = new Map();
  for (const item of items) groups.set(item.date, [...(groups.get(item.date) ?? []), item]);
  return [...groups.entries()];
}

/**
 * Sessions grouped by day. `nextId` highlights what is up next; `renderActions(item)` adds
 * organizer controls. Clicking a row calls `onSelect(item)`.
 */
export default function ScheduleList({ items, nextId, onSelect, renderActions }) {
  return (
    <div className="space-y-6">
      {groupByDate(items).map(([date, sessions]) => (
        <section key={date} aria-label={formatDate(date)}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{formatDate(date)}</h3>
          <ol className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {sessions.map((item) => {
              const live = item.status === 'ongoing';
              const isNext = item.id === nextId;
              return (
                <li key={item.id} className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:gap-4 ${live ? 'bg-emerald-50/60' : isNext ? 'bg-indigo-50/50' : ''} ${item.status === 'past' ? 'opacity-60' : ''}`}>
                  <div className="w-28 shrink-0 text-sm font-medium text-slate-900">
                    {formatTime(item.startTime)}
                    <span className="block text-xs font-normal text-slate-500">to {formatTime(item.endTime)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    disabled={!onSelect}
                    className="min-w-0 flex-1 text-left enabled:hover:text-indigo-700"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{item.title}</span>
                      <SessionTypeBadge type={item.sessionType} />
                      {live && <Badge tone="green">Happening now</Badge>}
                      {isNext && !live && <Badge tone="indigo">Up next</Badge>}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {item.venue && <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5" />{item.venue}</span>}
                      {item.speaker && <span className="inline-flex items-center gap-1"><Icon name="user" className="h-3.5 w-3.5" />{item.speaker}</span>}
                    </span>
                  </button>
                  {renderActions && <div className="flex shrink-0 gap-2">{renderActions(item)}</div>}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
