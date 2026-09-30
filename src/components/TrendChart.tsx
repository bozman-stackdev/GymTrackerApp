import { useState } from 'react';
import { formatDate } from '../logic/history';

export interface TrendPoint {
  date: string;
  value: number;
}

const W = 340;
const H = 160;
const PAD = { top: 16, right: 12, bottom: 24, left: 36 };

/** Minimal single-series line chart (no library). Tap or hover a point to see its value. */
export function TrendChart({ points, unit }: { points: TrendPoint[]; unit: string }) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length < 2) return <p className="muted small">The chart appears after two sessions.</p>;

  const values = points.map((p) => p.value);
  const lo = Math.floor(Math.min(...values) * 0.95);
  const hi = Math.ceil(Math.max(...values) * 1.05) || 1;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
  const ticks = [lo, Math.round((lo + hi) / 2), hi];

  const pick = (clientX: number, svg: SVGSVGElement) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  const a = active !== null ? points[active] : null;

  return (
    <div>
      <div className="small" style={{ minHeight: 20 }}>
        {a ? (
          <>
            <strong>{Math.round(a.value)} {unit}</strong> <span className="muted">· {formatDate(a.date)}</span>
          </>
        ) : (
          <span className="muted">Tap the chart for details</span>
        )}
      </div>
      <svg
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Trend from ${Math.round(values[0])} to ${Math.round(values.at(-1)!)} ${unit}`}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <text className="axis" x={PAD.left} y={H - 6}>{formatDate(points[0].date)}</text>
        <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">{formatDate(points.at(-1)!.date)}</text>
        {active !== null && <line className="cross" x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} />}
        <polyline className="line" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
        {points.map((p, i) => (
          <circle key={i} className="pt" cx={x(i)} cy={y(p.value)} r={i === active ? 6 : 4} />
        ))}
      </svg>
    </div>
  );
}
