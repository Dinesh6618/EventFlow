import Icon from '../ui/Icon.jsx';

/** Numbered progress indicator for multi-step forms: "01 Personal Info". Past steps show a check. */
export default function Stepper({ steps, current, label = 'Progress' }) {
  // Long flows (more than four steps) name only the current step below 2xl: the full labels do not fit beside a sidebar.
  const crowded = steps.length > 4;
  return (
    <ol aria-label={label} className="flex items-center gap-2 sm:gap-3">
      {steps.map((step, i) => {
        const done = i < current;
        const now = i === current;
        return (
          <li key={step} className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3" aria-current={now ? 'step' : undefined}>
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                done ? 'bg-emerald-500 text-white' : now ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
              }`}
            >
              {done ? <Icon name="check" className="h-4 w-4" /> : String(i + 1).padStart(2, '0')}
            </span>
            <span className={`hidden shrink-0 whitespace-nowrap text-sm font-medium ${now || !crowded ? 'sm:block' : '2xl:block'} ${now ? 'text-slate-900' : done ? 'text-slate-600' : 'text-slate-400'}`}>{step}</span>
            <span className="sr-only">{done ? ' (completed)' : now ? ' (current step)' : ''}</span>
            {i < steps.length - 1 && <span className={`h-0.5 min-w-3 flex-1 rounded-full transition-colors ${done ? 'bg-emerald-400' : 'bg-slate-200'}`} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
