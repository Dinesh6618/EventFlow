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

// Time | Session | Venue | Speaker, then room for row actions when the caller supplies them.
const COLUMNS = 'sm:grid sm:items-start sm:gap-4';
const GRID = 'sm:grid-cols-[6rem_minmax(0,1fr)_9rem_9rem]';
const GRID_WITH_ACTIONS = 'sm:grid-cols-[6rem_minmax(0,1fr)_9rem_9rem_9rem]';

/**
 * Sessions grouped by day, one row each in the order Time, Session, Venue, Speaker. `nextId` highlights what is
 * up next; `renderActions(item)` adds organizer controls. Clicking a session calls `onSelect(item)`.
 * `bare` drops the surrounding card, for lists that already sit inside one.
 */
export default function ScheduleList({ items, nextId, onSelect, renderActions, bare = false }) {
  const grid = `${COLUMNS} ${renderActions ? GRID_WITH_ACTIONS : GRID}`;
  return (
    <div className="space-y-6">
      {groupByDate(items).map(([date, sessions]) => (
        <section key={date} aria-label={formatDate(date)}>
          <h3 className="mb-2 text-sm font-medium text-slate-500">{formatDate(date)}</h3>
          <div className={bare ? 'border-y border-slate-100' : 'surface overflow-hidden'}>
            <div aria-hidden="true" className={`${grid} hidden border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500`}>
              <span>Time</span>
              <span>Session</span>
              <span>Venue</span>
              <span>Speaker</span>
              {renderActions && <span />}
            </div>
            <ol className="divide-y divide-slate-100">
              {sessions.map((item) => {
                const live = item.status === 'ongoing';
                const isNext = item.id === nextId;
                return (
                  <li key={item.id} className={`flex flex-col gap-1 px-4 py-3 ${grid} ${live ? 'bg-emerald-50' : isNext ? 'bg-indigo-50' : ''} ${item.status === 'past' ? 'opacity-60' : ''}`}>
                    <div className="text-sm font-medium tabular-nums text-slate-900">
                      {formatTime(item.startTime)}
                      <span className="block text-xs font-normal text-slate-400">to {formatTime(item.endTime)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelect?.(item)}
                      disabled={!onSelect}
                      className="min-w-0 text-left transition-colors enabled:hover:text-indigo-700"
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">{item.title}</span>
                        <SessionTypeBadge type={item.sessionType} />
                        {live && <Badge tone="green">Happening now</Badge>}
                        {isNext && !live && <Badge tone="indigo">Up next</Badge>}
                      </span>
                    </button>
                    <p className="min-w-0 text-sm text-slate-500">
                      {item.venue ? (
                        <span className="inline-flex items-center gap-1"><Icon name="pin" className="h-3.5 w-3.5 shrink-0 sm:hidden" /><span className="truncate">{item.venue}</span></span>
                      ) : (
                        <span className="hidden text-slate-400 sm:inline">-</span>
                      )}
                    </p>
                    <p className="min-w-0 text-sm text-slate-500">
                      {item.speaker ? (
                        <span className="inline-flex items-center gap-1"><Icon name="user" className="h-3.5 w-3.5 shrink-0 sm:hidden" /><span className="truncate">{item.speaker}</span></span>
                      ) : (
                        <span className="hidden text-slate-400 sm:inline">-</span>
                      )}
                    </p>
                    {renderActions && <div className="mt-1 flex shrink-0 gap-2 sm:mt-0 sm:justify-end">{renderActions(item)}</div>}
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      ))}
    </div>
  );
}
