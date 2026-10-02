import { EVENT_TYPES } from '../../utils/constants.js';
import { todayISO } from '../../utils/format.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const CONTROL =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30';

export default function EventFilters({ filters, onChange, onClear }) {
  const active = filters.q || filters.type || filters.date;

  return (
    <Card className="mb-6 p-4">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 md:grid-cols-[1fr_12rem_11rem_auto] md:items-end">
        <div>
          <label htmlFor="filter-q" className="mb-1.5 block text-xs font-medium text-slate-600">Search</label>
          <div className="relative">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="filter-q"
              type="search"
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
              placeholder="Search by name, venue or keyword"
              className={`${CONTROL} pl-9`}
            />
          </div>
        </div>
        <div>
          <label htmlFor="filter-type" className="mb-1.5 block text-xs font-medium text-slate-600">Event type</label>
          <select id="filter-type" value={filters.type} onChange={(e) => onChange({ type: e.target.value })} className={CONTROL}>
            <option value="">All types</option>
            {EVENT_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-date" className="mb-1.5 block text-xs font-medium text-slate-600">Date</label>
          <input id="filter-date" type="date" min={todayISO()} value={filters.date} onChange={(e) => onChange({ date: e.target.value })} className={CONTROL} />
        </div>
        <Button variant="secondary" onClick={onClear} disabled={!active}>
          Clear
        </Button>
      </form>
    </Card>
  );
}
