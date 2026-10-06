import { useId, useRef } from 'react';

/**
 * Accessible tab strip (pills). Arrow keys, Home and End move between tabs.
 * `tabs`: [{ key, label, count? }]. The panel is up to the caller; pass `panelId` to link them.
 */
export default function Tabs({ tabs, value, onChange, label, variant = 'pill', className = '' }) {
  const uid = useId();
  const refs = useRef({});

  const onKeyDown = (event) => {
    const index = tabs.findIndex((t) => t.key === value);
    let next = null;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    onChange(tabs[next].key);
    refs.current[tabs[next].key]?.focus();
  };

  const wrap =
    variant === 'underline'
      ? 'flex gap-1 overflow-x-auto border-b border-slate-200'
      : 'inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1';

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={`${wrap} ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.key === value;
        const styles =
          variant === 'underline'
            ? `-mb-px border-b-2 px-3 py-2.5 ${selected ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`
            : `rounded-md px-3 py-1.5 ${selected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              refs.current[tab.key] = el;
            }}
            id={`${uid}-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.key)}
            className={`whitespace-nowrap text-sm font-medium transition-colors ${styles}`}
          >
            {tab.label}
            {tab.count !== undefined && <span className={`ml-1.5 text-xs ${selected ? 'opacity-80' : 'text-slate-400'}`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
