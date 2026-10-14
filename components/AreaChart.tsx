"use client";
import { useId, useMemo, useState } from "react";
import { compact, fmtDay, fmtFullDate, fmtMonth, fmtTime, fmtLKR } from "@/lib/format";

export interface ChartPoint { t: number; v: number }

function smoothPath(pts: [number, number][]) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const W = 1000, H = 100;

/** Responsive area chart with right-hand axis and a hover read-out. `intraday` switches x labels to times. */
export default function AreaChart({ points, intraday = false, color = "#3b2fe0", height = "h-[240px] sm:h-[280px]", decimals = 0 }: { points: ChartPoint[]; intraday?: boolean; color?: string; height?: string; decimals?: number }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const vs = points.map((p) => p.v);
    const min = Math.min(...vs), max = Math.max(...vs);
    const pad = (max - min) * 0.12 || max * 0.02 || 1;
    const lo = min - pad, hi = max + pad;
    const t0 = points[0].t, t1 = points[points.length - 1].t;
    const xs = points.map((p) => (t1 === t0 ? 0 : ((p.t - t0) / (t1 - t0)) * W));
    const ys = vs.map((v) => H - ((v - lo) / (hi - lo)) * H);
    const pts = xs.map((x, i): [number, number] => [x, ys[i]]);
    const line = smoothPath(pts);
    const ticks = Array.from({ length: 5 }, (_, i) => hi - ((hi - lo) / 4) * i);
    const span = t1 - t0;
    const fmtX = (t: number) => (intraday ? fmtTime(t) : span > 200 * 86400000 ? fmtMonth(t) : fmtDay(t));
    const labels = Array.from({ length: 6 }, (_, i) => fmtX(points[Math.round((i / 5) * (points.length - 1))].t));
    return { line, area: `${line} L${W},${H} L0,${H} Z`, ticks, labels, xs, ys, fmtX };
  }, [points, intraday]);

  if (!geo) return <div className={`grid place-items-center text-sm text-muted ${height}`}>Not enough data to chart yet.</div>;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const plotW = r.width - 56; // matches the right axis gutter
    const x = Math.min(Math.max(e.clientX - r.left, 0), plotW) / plotW;
    let best = 0, bd = Infinity;
    geo.xs.forEach((px, i) => { const d = Math.abs(px / W - x); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const hp = hover !== null ? points[hover] : null;

  return (
    <div>
      <div className={`relative touch-pan-y ${height}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-y-0 left-0 h-full w-[calc(100%-3.5rem)] overflow-visible" role="img" aria-label="Price chart">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} stroke="#e8eaef" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          <path d={geo.area} fill={`url(#${gid})`} />
          <path d={geo.line} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {hover !== null && <line x1={geo.xs[hover]} x2={geo.xs[hover]} y1="0" y2={H} stroke={color} strokeOpacity="0.4" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover !== null && (
          <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `calc((100% - 3.5rem) * ${geo.xs[hover] / W})`, top: `${geo.ys[hover]}%`, background: color }} />
        )}
        {geo.ticks.map((t, i) => (
          <span key={i} className="money absolute right-0 -translate-y-1/2 text-xs text-muted sm:text-sm" style={{ top: `${i * 25}%` }}>{compact(t, decimals ? 2 : 2)}</span>
        ))}
        {hp && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `clamp(0px, calc((100% - 3.5rem) * ${geo.xs[hover!] / W} - 50px), calc(100% - 7rem - 100px))` }}>
            <div className="money font-semibold">LKR {fmtLKR(hp.v, decimals)}</div>
            <div className="opacity-70">{intraday ? fmtTime(hp.t) : fmtFullDate(hp.t)}</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between pr-14 text-xs text-muted sm:text-sm">{geo.labels.map((l, i) => <span key={i}>{l}</span>)}</div>
    </div>
  );
}
