import Icon from './Icon.jsx';

/** Large rounded search field with a clear button. */
export default function SearchBar({ value, onChange, placeholder = 'Search...', label = 'Search', className = '', id = 'search-bar' }) {
  return (
    <div role="search" className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="block w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-11 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 [&::-webkit-search-cancel-button]:hidden"
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
