import Icon from '../ui/Icon.jsx';

const STEPS = [
  ['generated', 'AI generated'],
  ['review', 'Review'],
  ['edit', 'Edit'],
  ['confirm', 'Confirm'],
  ['publish', 'Publish'],
];

/**
 * Where a plan is in the workflow. A draft is at review/edit; a confirmed plan is ready to publish;
 * a published plan is finished.
 */
export default function PlanStepper({ status, dirty }) {
  const current = status === 'published' ? 5 : status === 'confirmed' ? 4 : dirty ? 2 : 1;

  return (
    <ol aria-label="Plan progress" className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {STEPS.map(([key, label], i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={key} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                done ? 'bg-emerald-600 text-white' : active ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <Icon name="check" className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`${active ? 'font-semibold text-slate-900' : done ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
            {i < STEPS.length - 1 && <span aria-hidden="true" className="mx-1 hidden h-px w-5 bg-slate-300 sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
