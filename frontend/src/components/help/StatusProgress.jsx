import Icon from '../ui/Icon.jsx';
import { STATUS_FLOW, STATUS_META, clockTime } from '../../utils/help.js';

const STAMPS = {
  reported: 'createdAt',
  acknowledged: 'acknowledgedAt',
  assigned: 'assignedAt',
  in_progress: 'startedAt',
  resolved: 'resolvedAt',
  closed: 'closedAt',
};

/**
 * REPORTED -> ACKNOWLEDGED -> ASSIGNED -> IN PROGRESS -> RESOLVED -> CLOSED, with the time each step
 * was reached. A cancelled request ends in its own step.
 */
export default function StatusProgress({ request }) {
  const cancelled = request.status === 'cancelled';
  const current = STATUS_FLOW.indexOf(request.status);
  const steps = STATUS_FLOW.map((key, index) => {
    const at = request[STAMPS[key]];
    // A step counts as done once it has a time, or a later step has been reached.
    const done = Boolean(at) || (!cancelled && index < current);
    return { key, at, done, active: key === request.status };
  });

  return (
    <ol className="space-y-0" aria-label="Request progress">
      {steps.map((step, i) => {
        const last = i === steps.length - 1 && !cancelled;
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0" aria-current={step.active ? 'step' : undefined}>
            {!last && <span aria-hidden="true" className={`absolute left-[0.8125rem] top-7 h-[calc(100%-1.25rem)] w-0.5 ${step.done && steps[i + 1].done ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
            <span
              className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                step.active ? 'bg-indigo-600 text-white ring-2 ring-indigo-200 ring-offset-1' : step.done ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.done && !step.active ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className={`text-sm font-semibold ${step.active ? 'text-indigo-700' : step.done ? 'text-slate-900' : 'text-slate-400'}`}>{STATUS_META[step.key].label}</p>
              {step.at && <p className="text-xs text-slate-500">{clockTime(step.at)}</p>}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="relative flex gap-3 pt-5" aria-current="step">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-white"><Icon name="x" className="h-3.5 w-3.5" /></span>
          <div className="pt-0.5">
            <p className="text-sm font-semibold text-slate-700">Cancelled</p>
            {request.cancelledAt && <p className="text-xs text-slate-500">{clockTime(request.cancelledAt)}</p>}
          </div>
        </li>
      )}
    </ol>
  );
}
