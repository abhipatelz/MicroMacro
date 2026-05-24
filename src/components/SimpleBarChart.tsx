'use client';

import { useMemo, useState, useRef, useEffect } from 'react';

/**
 * Lightweight SVG bar chart — replaces recharts for our two use cases
 * (grouped monthly bars on /yearly, single-series velocity on /insights).
 * No external deps, no canvas/D3 — just SVG. The whole component is
 * ~3 kB minified vs recharts' ~150 kB.
 *
 * Supports:
 * - One or more series (grouped bars when length > 1)
 * - Hover tooltip
 * - Auto y-axis with integer ticks
 * - Responsive width via ResizeObserver — height stays fixed.
 */

export interface Series {
  key:   string;          // dataKey on each row
  name:  string;          // legend label
  color: string;          // bar fill
}

export interface SimpleBarChartProps {
  data:    Record<string, any>[]; // each row has `label` + one value per series key
  series:  Series[];
  height?: number;
  legend?: boolean;
}

export function SimpleBarChart({ data, series, height = 280, legend = true }: SimpleBarChartProps) {
  const [width, setWidth]   = useState(640);
  const [hover, setHover]   = useState<{ row: number; x: number; y: number } | null>(null);
  const wrapRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry?.contentRect?.width) setWidth(Math.max(320, entry.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padding = { top: 12, right: 16, bottom: 28, left: 36 };
  const innerW  = width  - padding.left - padding.right;
  const innerH  = height - padding.top  - padding.bottom;

  const max = useMemo(() => {
    let m = 0;
    for (const row of data) for (const s of series) m = Math.max(m, Number(row[s.key]) || 0);
    return Math.max(1, m);
  }, [data, series]);

  // Round y-axis to a clean tick
  const yMax       = Math.ceil(max * 1.05);
  const yTickCount = Math.min(5, yMax);
  const yTicks     = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round((yMax * i) / yTickCount));

  const groupWidth = data.length > 0 ? innerW / data.length : 0;
  const barGap     = 4;
  const barWidth   = data.length > 0
    ? Math.max(4, (groupWidth - barGap * (series.length + 1)) / series.length)
    : 0;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg width={width} height={height} role="img" aria-label="Bar chart">
        {/* Y-axis grid + labels */}
        {yTicks.map((t) => {
          const y = padding.top + innerH - (t / yMax) * innerH;
          return (
            <g key={t}>
              <line x1={padding.left} x2={padding.left + innerW} y1={y} y2={y}
                    stroke="#e2e8f0" strokeWidth={1} strokeDasharray="3 3" />
              <text x={padding.left - 6} y={y + 3} fontSize={10} fill="#94a3b8" textAnchor="end">
                {t}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((row, rIdx) => {
          const groupX = padding.left + rIdx * groupWidth;
          return (
            <g key={rIdx}>
              {series.map((s, sIdx) => {
                const value = Number(row[s.key]) || 0;
                const h     = (value / yMax) * innerH;
                const x     = groupX + barGap + sIdx * (barWidth + barGap);
                const y     = padding.top + innerH - h;
                return (
                  <rect
                    key={s.key}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={s.color}
                    rx={3}
                    onMouseEnter={(e) => setHover({ row: rIdx, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })}
              <text
                x={groupX + groupWidth / 2}
                y={padding.top + innerH + 16}
                fontSize={10}
                fill="#64748b"
                textAnchor="middle">
                {String(row.label ?? row.name ?? '')}
              </text>
            </g>
          );
        })}
      </svg>

      {hover !== null && data[hover.row] && (
        <div
          className="pointer-events-none absolute rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: Math.min(width - 140, (hover.row + 0.5) * groupWidth + padding.left - 60),
            top:  4,
          }}
        >
          <div className="font-semibold text-slate-700 mb-0.5">
            {String(data[hover.row].label ?? '')}
          </div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-slate-600">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: s.color }} />
              <span>{s.name}:</span>
              <span className="font-semibold">{Number(data[hover.row][s.key]) || 0}</span>
            </div>
          ))}
        </div>
      )}

      {legend && series.length > 1 && (
        <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-500">
          {series.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
