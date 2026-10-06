import { useId } from 'react';

const CONTROL =
  'block w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:bg-slate-100';

function Field({ label, error, hint, required, children, id }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

function controlProps(id, error) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
    className: `${CONTROL} ${error ? 'border-red-400' : 'border-slate-300'}`,
  };
}

export function Input({ label, error, hint, required, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <input {...controlProps(id, error)} required={required} {...props} />
    </Field>
  );
}

export function Textarea({ label, error, hint, required, rows = 5, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <textarea {...controlProps(id, error)} rows={rows} required={required} {...props} />
    </Field>
  );
}

export function Select({ label, error, hint, required, options, placeholder, ...props }) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <select {...controlProps(id, error)} required={required} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => {
          const { value, label } = typeof option === 'object' ? option : { value: option, label: option };
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

export function Checkbox({ label, hint, ...props }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" {...props} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-slate-500">{hint}</span>}
      </label>
    </div>
  );
}
