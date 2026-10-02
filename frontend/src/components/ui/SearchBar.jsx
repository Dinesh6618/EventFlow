import Icon from './Icon.jsx';

/** Large rounded search field with a clear button. */
export default function SearchBar({ value, onChange, placeholder = 'Search...', label = 'Search', className = '', id = 'search-bar' }) {
  return (
    <div role="search" className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-12 pr-11 text-base text-slate-900 shadow-sm transition-shadow placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
