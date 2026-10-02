import { useId } from 'react';
import Icon from './Icon.jsx';

/** 1-5 star picker, keyboard accessible as a radio group. Pass `readOnly` to just display a value. */
export default function StarRating({ label, value, onChange, error, required = false, readOnly = false }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={`${id}-label`} aria-invalid={error ? true : undefined}>
      <p id={`${id}-label`} className="mb-1.5 text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= (value || 0);
          return (
            <label key={n} className={readOnly ? '' : 'cursor-pointer'}>
              <input
                type="radio"
                name={id}
                value={n}
                checked={value === n}
                disabled={readOnly}
                onChange={() => onChange?.(n)}
                className="peer sr-only"
              />
              <span className="sr-only">{n} star{n === 1 ? '' : 's'}</span>
              <Icon
                name="star"
                className={`h-7 w-7 rounded transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-600 ${filled ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-300 hover:text-amber-300'}`}
              />
            </label>
          );
        })}
        {value ? <span className="ml-2 text-sm text-slate-500">{value} / 5</span> : null}
      </div>
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
