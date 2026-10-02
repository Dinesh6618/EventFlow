import { formatTime } from '../../utils/format.js';
import Badge from './Badge.jsx';
import Icon from './Icon.jsx';

const TYPE_STYLE = {
  talk: ['bg-indigo-100 text-indigo-600', 'message', 'Talk', 'indigo'],
  workshop: ['bg-emerald-100 text-emerald-600', 'layers', 'Workshop', 'green'],
  break: ['bg-slate-100 text-slate-500', 'clock', 'Break', 'slate'],
  competition: ['bg-amber-100 text-amber-600', 'trophy', 'Competition', 'amber'],
  evaluation_round: ['bg-pink-100 text-pink-600', 'star', 'Evaluation', 'pink'],
  session: ['bg-sky-100 text-sky-600', 'calendar', 'Session', 'blue'],
};

/**
 * Vertical timeline. `items`: [{ id, startTime, endTime, title, sessionType, venue, speaker, status, description }].
 * The session that is on right now (status "ongoing") is highlighted and marked ONGOING.
 */
export default function Timeline({ items, onSelect, renderActions }) {
  return (
    <ol className="relative space-y-1" aria-label="Schedule timeline">
      {items.map((item, index) => {
        const [iconStyle, icon, typeLabel, tone] = TYPE_STYLE[item.sessionType] || TYPE_STYLE.session;
        const live = item.status === 'ongoing';
        const past = item.status === 'past';
        const last = index === items.length - 1;
        return (
          <li key={item.id} className="relative flex gap-4" aria-current={live ? 'step' : undefined}>
            <div className="w-[4.75rem] shrink-0 pt-4 text-right sm:w-24">
              <p className={`text-sm font-bold ${live ? 'text-emerald-600' : 'text-slate-900'}`}>{formatTime(item.startTime)}</p>
              <p className="text-xs text-slate-400">{formatTime(item.endTime)}</p>
            </div>

            <div className="relative flex flex-col items-center" aria-hidden="true">
              <span
                className={`relative z-10 mt-3.5 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-slate-50 ${live ? 'bg-emerald-500 text-white scan-success' : iconStyle}`}
              >
                <Icon name={live ? 'zap' : icon} className="h-4 w-4" />
              </span>
              {!last && <span className="-mb-1 mt-1 w-0.5 flex-1 bg-gradient-to-b from-indigo-200 to-slate-200" />}
            </div>

            <div className="min-w-0 flex-1 pb-4">
              <div
                className={`rounded-2xl border p-4 transition-shadow ${
                  live ? 'border-emerald-300 bg-emerald-50/70 shadow-md shadow-emerald-500/10' : 'border-slate-200 bg-white hover:shadow-card'
                } ${past ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {onSelect ? (
                    <button type="button" onClick={() => onSelect(item)} className="text-left font-bold text-slate-900 hover:text-indigo-700">
                      {item.title}
                    </button>
                  ) : (
                    <h4 className="font-bold text-slate-900">{item.title}</h4>
                  )}
                  {live && (
                    <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[0.7rem] font-extrabold tracking-wider text-white">ONGOING</span>
                  )}
                  <Badge tone={tone}>{typeLabel}</Badge>
                </div>
                {(item.venue || item.speaker) && (
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                    {item.venue && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="pin" className="h-3.5 w-3.5" />
                        {item.venue}
                      </span>
                    )}
                    {item.speaker && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="user" className="h-3.5 w-3.5" />
                        {item.speaker}
                      </span>
                    )}
                  </p>
                )}
                {item.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{item.description}</p>}
                {renderActions && <div className="mt-3 flex gap-2">{renderActions(item)}</div>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
