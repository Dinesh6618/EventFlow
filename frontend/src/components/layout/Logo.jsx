export function LogoMark({ className = 'h-9 w-9' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl grad-brand text-white shadow-md shadow-indigo-600/30 ${className}`}>
      <svg viewBox="0 0 24 24" className="h-[55%] w-[55%]" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        <path d="M5 7h14M5 12h14M5 17h8" />
      </svg>
    </span>
  );
}

export default function Logo({ light = false, compact = false }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className={`text-lg font-extrabold uppercase tracking-wide ${light ? 'text-white' : 'text-slate-900'}`}>
          Event<span className={light ? 'text-indigo-300' : 'text-indigo-600'}>Flow</span>
        </span>
      )}
    </span>
  );
}
