import { useState } from 'react';
import { ChartFrame, SERIES, axisTicks, formatNumber, useChartTooltip, useElementWidth } from './core.jsx';

const MARGIN = { top: 18, right: 8, bottom: 26, left: 34 };
const MAX_BAR = 24;
const RADIUS = 4;

/** Column with a 4px rounded top and a square base (grows from one baseline). */
const columnPath = (x, y, w, h) => {
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
};

function Columns({ data, height, color, format, unit, ariaLabel, emphasizeMax }) {
  const [ref, width] = useElementWidth();
  const tooltip = useChartTooltip();
  const [hover, setHover] = useState(null);

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const max = Math.max(...data.map((d) => d.value), 0);
  const ticks = axisTicks(max);
  const top = ticks[ticks.length - 1];
  const band = innerW / Math.max(data.length, 1);
  const barW = Math.min(MAX_BAR, Math.max(band - 6, 3));
  const y = (v) => MARGIN.top + innerH - (v / top) * innerH;
  const every = Math.max(1, Math.ceil(44 / band));
  const maxIndex = data.findIndex((d) => d.value === max);

  const describe = (d) => ({ title: d.label, rows: [{ color, name: d.detail ?? unit, value: format(d.value) }] });
  const showAt = (event, i, d) =>
    tooltip.show(event, describe(d), event.type === 'focus' ? { x: MARGIN.left + band * (i + 0.5), y: y(d.value) } : undefined);

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth="1" />
            <text x={MARGIN.left - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{formatNumber(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = MARGIN.left + band * (i + 0.5);
          const h = innerH - (y(d.value) - MARGIN.top);
          return (
            <g key={`${d.label}-${i}`}>
              {d.value > 0 && <path d={columnPath(cx - barW / 2, y(d.value), barW, h)} fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {(emphasizeMax && i === maxIndex && d.value > 0) && (
                <text x={cx} y={y(d.value) - 5} textAnchor="middle" className="fill-slate-900 text-[11px] font-semibold">{format(d.value)}</text>
              )}
              {i % every === 0 && (
                <text x={cx} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">{d.axisLabel ?? d.label}</text>
              )}
              {/* Hit area is the whole band, taller than the mark itself. */}
              <rect
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${format(d.value)} ${unit}`}
                onPointerMove={(e) => { setHover(i); showAt(e, i, d); }}
                onPointerLeave={() => { setHover(null); tooltip.hide(); }}
                onFocus={(e) => { setHover(i); showAt(e, i, d); }}
                onBlur={() => { setHover(null); tooltip.hide(); }}
                className="outline-none focus-visible:stroke-indigo-600 focus-visible:stroke-2"
              />
            </g>
          );
        })}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} stroke="var(--viz-axis)" strokeWidth="1" />
      </svg>
    </div>
  );
}

/** Vertical bars for a handful of categories or time buckets. Single series, so no legend box. */
export default function ColumnChart({ data, height = 200, color = SERIES[0], format = formatNumber, unit = 'count', ariaLabel, emphasizeMax = true }) {
  return (
    <ChartFrame>
      <Columns {...{ data, height, color, format, unit, ariaLabel, emphasizeMax }} />
    </ChartFrame>
  );
}
