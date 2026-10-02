import { useState } from 'react';
import { ChartFrame, Legend, SERIES, formatNumber, useChartTooltip } from './core.jsx';

const BAR = 16; // thickness, well under the 24px cap
const GAP = 2; // surface gap between touching bars

/**
 * Horizontal bars: one row per category, one bar per series. Values sit at the bar tip.
 * rows: [{ name, values: [n, ...] }]; series: ['Registrations', 'Attendance'].
 * Identity is the legend (two or more series) and the row label; colour only styles the marks.
 */
function Rows({ rows, series, format, max, unit }) {
  const tooltip = useChartTooltip();
  const [hover, setHover] = useState(null);
  const top = max ?? Math.max(...rows.flatMap((r) => r.values), 0);

  const describe = (row) => ({
    title: row.name,
    rows: series.map((name, s) => ({ color: SERIES[s], name, value: format(row.values[s]) })),
  });

  return (
    <ul className="space-y-2.5">
      {rows.map((row, i) => (
        <li key={row.name}>
          <div
            tabIndex={0}
            role="group"
            aria-label={`${row.name}: ${series.map((name, s) => `${name} ${format(row.values[s])}`).join(', ')}`}
            className="grid grid-cols-[minmax(5rem,9rem)_1fr] items-center gap-3 rounded outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 sm:grid-cols-[minmax(7rem,12rem)_1fr]"
            onPointerMove={(e) => { setHover(i); tooltip.show(e, describe(row)); }}
            onPointerLeave={() => { setHover(null); tooltip.hide(); }}
            onFocus={(e) => { setHover(i); tooltip.show(e, describe(row), { x: e.currentTarget.getBoundingClientRect().width / 2, y: e.currentTarget.offsetTop }); }}
            onBlur={() => { setHover(null); tooltip.hide(); }}
          >
            <span className="truncate text-sm text-slate-700" title={row.name}>{row.name}</span>
            {row.values.every((v) => !v) ? (
              <span className="text-xs text-slate-400">None yet</span>
            ) : (
            <span className="flex flex-col" style={{ gap: GAP }}>
              {row.values.map((value, s) => (
                <span key={series[s]} className="flex items-center gap-2">
                  <span
                    className="block shrink-0"
                    style={{
                      height: BAR,
                      width: `${top ? (value / top) * 100 : 0}%`,
                      minWidth: value > 0 ? 4 : 0,
                      maxWidth: 'calc(100% - 3.5rem)',
                      background: SERIES[s],
                      borderRadius: '0 4px 4px 0', // rounded data end, square at the baseline
                      opacity: hover === null || hover === i ? 1 : 0.55,
                    }}
                  />
                  <span className="text-xs font-semibold tabular-nums text-slate-900">{format(value)}{unit}</span>
                </span>
              ))}
            </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function BarList({ rows, series = ['Count'], format = formatNumber, unit = '', max }) {
  return (
    <ChartFrame>
      <div className="mb-3"><Legend items={series} /></div>
      <Rows {...{ rows, series, format, max, unit }} />
    </ChartFrame>
  );
}
