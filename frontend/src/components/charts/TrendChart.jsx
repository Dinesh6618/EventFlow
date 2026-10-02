import { useState } from 'react';
import { ChartFrame, SERIES, axisTicks, formatNumber, useChartTooltip, useElementWidth } from './core.jsx';

const MARGIN = { top: 14, right: 16, bottom: 26, left: 34 };

const shortDate = (label) => {
  const d = new Date(`${label}T00:00:00`);
  return Number.isNaN(d.getTime()) ? label : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

function Trend({ points, height, color, valueName, extraName, ariaLabel }) {
  const [ref, width] = useElementWidth();
  const tooltip = useChartTooltip();
  const [active, setActive] = useState(null);

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = height - MARGIN.top - MARGIN.bottom;
  const ticks = axisTicks(Math.max(...points.map((p) => p.value), 0));
  const top = ticks[ticks.length - 1];
  const x = (i) => MARGIN.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v) => MARGIN.top + innerH - (v / top) * innerH;

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const labelAt = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  const describe = (p) => ({
    title: shortDate(p.label),
    rows: [
      { color, name: valueName, value: formatNumber(p.value) },
      ...(p.extra !== undefined ? [{ name: extraName, value: `+${formatNumber(p.extra)}` }] : []),
    ],
  });

  const nearest = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = (event.clientX - rect.left - MARGIN.left) / innerW;
    return Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1))));
  };

  const move = (event) => {
    const i = points.length === 1 ? 0 : nearest(event);
    setActive(i);
    tooltip.show(event, describe(points[i]), { x: x(i), y: y(points[i].value) });
  };

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth="1" />
            <text x={MARGIN.left - 6} y={y(t) + 4} textAnchor="end" className="fill-slate-500 text-[10px]">{formatNumber(t)}</text>
          </g>
        ))}
        {points.length > 1 && <path d={area} fill={color} opacity="0.1" />}
        {points.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
        {points.map((p, i) =>
          labelAt.has(i) ? <text key={p.label} x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-slate-500 text-[10px]">{shortDate(p.label)}</text> : null,
        )}
        {active !== null && <line x1={x(active)} x2={x(active)} y1={MARGIN.top} y2={y(0)} stroke="var(--viz-axis)" strokeWidth="1" />}
        {/* End dot (and the hovered dot) wear a 2px surface ring so they stay legible over the line. */}
        {[points.length - 1, active].filter((v, k, a) => v !== null && a.indexOf(v) === k).map((i) => (
          <circle key={i} cx={x(i)} cy={y(points[i].value)} r="5" fill={color} stroke="#fff" strokeWidth="2" />
        ))}
        <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} stroke="var(--viz-axis)" strokeWidth="1" />
        <rect
          x={MARGIN.left} y={MARGIN.top} width={innerW} height={innerH} fill="transparent" tabIndex={0}
          aria-label={`${ariaLabel}. Use left and right arrows to read each point.`}
          onPointerMove={move}
          onPointerLeave={() => { setActive(null); tooltip.hide(); }}
          onFocus={() => { const i = points.length - 1; setActive(i); tooltip.show(null, describe(points[i]), { x: x(i), y: y(points[i].value) }); }}
          onBlur={() => { setActive(null); tooltip.hide(); }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            const i = Math.min(points.length - 1, Math.max(0, (active ?? points.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)));
            setActive(i);
            tooltip.show(null, describe(points[i]), { x: x(i), y: y(points[i].value) });
          }}
          className="outline-none focus-visible:stroke-indigo-600 focus-visible:stroke-2"
        />
      </svg>
    </div>
  );
}

/** One line (cumulative total) with a soft area wash and a crosshair tooltip. Single series: no legend box. */
export default function TrendChart({ points, height = 220, color = SERIES[0], valueName = 'Total', extraName = 'That day', ariaLabel }) {
  return (
    <ChartFrame>
      <Trend {...{ points, height, color, valueName, extraName, ariaLabel }} />
    </ChartFrame>
  );
}
