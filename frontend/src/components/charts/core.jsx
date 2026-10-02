import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Categorical series slots (validated palette, first three slots only). Marks wear these; text never does. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

export const formatNumber = (n) => (n === null || n === undefined ? '-' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n));
export const formatPercent = (n) => `${formatNumber(n)}%`;

/** Width of an element, kept current as it resizes. */
export function useElementWidth(fallback = 480) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(el.clientWidth || fallback);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width) || fallback));
    observer.observe(el);
    return () => observer.disconnect();
  }, [fallback]);
  return [ref, width];
}

/** Clean axis ticks: 0 .. a round maximum, in steps of 1, 2 or 5 (times a power of ten), at most 4 gaps. */
export function axisTicks(max, { integer = true } = {}) {
  if (!(max > 0)) return [0, 1];
  let step = 10 ** Math.floor(Math.log10(max / 4));
  for (const mult of [1, 2, 5, 10]) {
    if (max / (step * mult) <= 4) {
      step *= mult;
      break;
    }
  }
  if (integer) step = Math.max(1, Math.ceil(step));
  const ticks = [];
  for (let v = 0; v < max + step; v += step) {
    ticks.push(Math.round(v * 100) / 100);
    if (v >= max) break;
  }
  return ticks;
}

const TooltipContext = createContext(null);
export const useChartTooltip = () => useContext(TooltipContext);

/**
 * Positioned container for a chart plus its single tooltip.
 * Children call tooltip.show(event, { title, rows: [{ color, name, value }] }) and tooltip.hide().
 * Text is inserted as React text nodes, never as HTML.
 */
export function ChartFrame({ children, className = '' }) {
  const box = useRef(null);
  const [tip, setTip] = useState(null);

  const show = useCallback((event, content, anchor) => {
    const rect = box.current.getBoundingClientRect();
    const x = anchor ? anchor.x : event.clientX - rect.left;
    const y = anchor ? anchor.y : event.clientY - rect.top;
    setTip({ x, y, content, width: rect.width });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  useEffect(() => {
    if (!tip) return undefined;
    const onKey = (e) => e.key === 'Escape' && setTip(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [tip]);

  const flip = tip && tip.x > tip.width * 0.6;
  return (
    <TooltipContext.Provider value={{ show, hide }}>
      <div ref={box} className={`relative ${className}`}>
        {children}
        {tip && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 min-w-36 max-w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
            style={{ top: Math.max(tip.y - 12, 0), left: flip ? undefined : tip.x + 14, right: flip ? tip.width - tip.x + 14 : undefined }}
          >
            <p className="mb-1 font-medium text-slate-500">{tip.content.title}</p>
            {tip.content.rows.map((row) => (
              <p key={row.name} className="flex items-center gap-2 text-slate-600">
                {row.color && <span aria-hidden="true" className="h-0.5 w-3.5 shrink-0 rounded" style={{ background: row.color }} />}
                <span className="text-sm font-semibold text-slate-900">{row.value}</span>
                <span>{row.name}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </TooltipContext.Provider>
  );
}

/** Legend: required for two or more series. `shape` mirrors the mark (rect for bars, line for lines). */
export function Legend({ items, shape = 'rect' }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
      {items.map((item, i) => (
        <li key={item} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={shape === 'line' ? 'h-0.5 w-4 rounded' : 'h-2.5 w-2.5 rounded-sm'} style={{ background: SERIES[i] }} />
          {item}
        </li>
      ))}
    </ul>
  );
}
