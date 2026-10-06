import { useState } from 'react';
import Card from '../ui/Card.jsx';

/**
 * Card around one chart: title, optional subtitle, and a Chart/Table switch so every figure
 * can be read without hovering. `table` is { columns: [..], rows: [[..], ..] }.
 */
export default function ChartCard({ title, subtitle, table, empty = false, emptyText = 'Nothing to show yet.', className = '', children }) {
  const [view, setView] = useState('chart');
  const showTable = view === 'table' && table && !empty;

  return (
    // min-w-0: charts size themselves from their container, so the card must be allowed to shrink inside a grid.
    <Card className={`viz min-w-0 p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {table && !empty && (
          <div role="group" aria-label={`${title} view`} className="inline-flex shrink-0 rounded-lg border border-slate-200 p-0.5 text-xs">
            {['chart', 'table'].map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-2 py-1 font-medium capitalize transition-colors ${view === v ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      {empty ? (
        <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>
      ) : showTable ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs font-medium text-slate-500">
              <tr>{table.columns.map((c) => <th key={c} scope="col" className="py-1.5 pr-4 font-medium">{c}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.rows.map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <td key={j} className={`py-1.5 pr-4 ${j === 0 ? 'text-slate-700' : 'tabular-nums text-slate-900'}`}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}
