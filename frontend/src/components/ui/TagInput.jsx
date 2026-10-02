import { useId, useState } from 'react';
import Icon from './Icon.jsx';

const normalise = (value) => value.replace(/\s+/g, ' ').trim();

/** Chip input for short lists such as skills. Enter or comma adds; Backspace on empty removes the last. */
export default function TagInput({ label, hint, value, onChange, max = 15, placeholder = 'Type a skill and press Enter', error, maxLength = 40 }) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = (raw) => {
    const tag = normalise(raw).slice(0, maxLength);
    if (!tag || value.length >= max || value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(draft);
      setDraft('');
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className={`flex flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 ${error ? 'border-red-400' : 'border-slate-300'}`}>
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== tag))} aria-label={`Remove ${tag}`} className="rounded-full p-0.5 hover:bg-indigo-100">
              <Icon name="x" className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            add(draft);
            setDraft('');
          }}
          disabled={value.length >= max}
          placeholder={value.length >= max ? `Maximum of ${max} reached` : placeholder}
          className="min-w-32 flex-1 border-0 bg-transparent px-1 py-1 text-sm focus:outline-none focus:ring-0"
        />
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
