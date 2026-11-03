"use client";
import { useId, useMemo, useState } from "react";
import { fmtDay, fmtFullDate, fmtMonth } from "@/lib/format";
import { yRange } from "@/lib/chart";

export interface Series {
  name: string;
  color: string;
  values: (number | null)[]; // aligned to `dates`
  type?: "line" | "area" | "step"; // step: holds flat until the next value (cost / avg-cost lines)
  dashed?: boolean;
}

const W = 1000, H = 100;

/**
 * Responsive multi-series chart (line / area / stepped), with an optional green-above / red-below fill for a
 * single "gain" series. Straight segments (no smoothing) so daily moves read accurately. Hover shows every value.
 */
export default function MultiLineChart({
  dates, series, height = "h-[220px] sm:h-[260px]", formatY, gainFill = false, legend = true,
}: {
  dates: number[]; series: Series[]; height?: string; formatY?: (n: number) => string; gainFill?: boolean; legend?: boolean;
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (dates.length < 2) return null;
    const { lo, hi } = yRange(series, gainFill);
    const span = hi - lo || 1;
    const t0 = dates[0], t1 = dates[dates.length - 1];
    const x = (t: number) => (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * W);
    const y = (v: number) => H - ((v - lo) / span) * H;
    const xs = dates.map(x);

    const paths = series.map((s) => {
      const pts: [number, number][] = [];
      s.values.forEach((v, i) => { if (v !== null && Number.isFinite(v)) pts.push([xs[i], y(v)]); });
      if (pts.length < 2) return { line: "", area: "" };
      let line = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        if (s.type === "step") line += ` H${pts[i][0]} V${pts[i][1]}`;
        else line += ` L${pts[i][0]},${pts[i][1]}`;
      }
      const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
      return { line, area };
    });

    const ticks = Array.from({ length: 5 }, (_, i) => hi - (span / 4) * i);
    const zeroY = lo <= 0 && hi >= 0 ? (y(0) / H) * 100 : null;
    const bigSpan = t1 - t0 > 200 * 86400000;
    const labels = Array.from({ length: 6 }, (_, i) => {
      const t = dates[Math.round((i / 5) * (dates.length - 1))];
      return bigSpan ? fmtMonth(t) : fmtDay(t);
    });
    return { lo, hi, span, xs, y, paths, ticks, zeroY, labels };
  }, [dates, series, gainFill]);

  if (!geo) return <div className={`grid place-items-center rounded-xl bg-subtle text-sm text-muted ${height}`}>Not enough data to chart yet.</div>;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const plotW = r.width - 56;
    const frac = Math.min(Math.max(e.clientX - r.left, 0), plotW) / plotW;
    let best = 0, bd = Infinity;
    geo.xs.forEach((px, i) => { const d = Math.abs(px / W - frac); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };
  const fmt = formatY ?? ((n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 }));

  return (
    <div>
      <div className={`relative touch-pan-y ${height}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-y-0 left-0 h-full w-[calc(100%-3.5rem)] overflow-visible" role="img" aria-label="Chart">
          <defs>
            {series.map((s, i) => (
              <linearGradient key={i} id={`${gid}-a${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={s.color} stopOpacity="0.18" /><stop offset="100%" stopColor={s.color} stopOpacity="0" /></linearGradient>
            ))}
            {gainFill && geo.zeroY !== null && (
              <>
                <clipPath id={`${gid}-pos`}><rect x="0" y="0" width={W} height={(geo.zeroY / 100) * H} /></clipPath>
                <clipPath id={`${gid}-neg`}><rect x="0" y={(geo.zeroY / 100) * H} width={W} height={H} /></clipPath>
              </>
            )}
          </defs>
          {[0, 25, 50, 75, 100].map((p) => <line key={p} x1="0" x2={W} y1={(p / 100) * H} y2={(p / 100) * H} stroke="#eceef2" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
          {geo.zeroY !== null && <line x1="0" x2={W} y1={(geo.zeroY / 100) * H} y2={(geo.zeroY / 100) * H} stroke="#9aa0ad" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}

          {series.map((s, i) => {
            const path = geo.paths[i];
            if (!path.line) return null;
            if (gainFill && geo.zeroY !== null) {
              return (
                <g key={i}>
                  <path d={path.area} fill="#0f9d6b" fillOpacity="0.16" clipPath={`url(#${gid}-pos)`} />
                  <path d={path.area} fill="#d92d3a" fillOpacity="0.16" clipPath={`url(#${gid}-neg)`} />
                  <path d={path.line} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
                </g>
              );
            }
            return (
              <g key={i}>
                {s.type === "area" && <path d={path.area} fill={`url(#${gid}-a${i})`} />}
                <path d={path.line} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "5 4" : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </g>
            );
          })}
          {hover !== null && <line x1={geo.xs[hover]} x2={geo.xs[hover]} y1="0" y2={H} stroke="#9aa0ad" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>

        {series.map((s, i) => {
          const v = hover !== null ? s.values[hover] : null;
          return v === null || hover === null ? null : <span key={i} className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ left: `calc((100% - 3.5rem) * ${geo.xs[hover] / W})`, top: `${(geo.y(v) / H) * 100}%`, background: s.color }} />;
        })}
        {geo.ticks.map((t, i) => <span key={i} className="money absolute right-0 -translate-y-1/2 text-[11px] text-muted sm:text-xs" style={{ top: `${i * 25}%` }}>{fmt(t)}</span>)}

        {hover !== null && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-y-full rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-lg" style={{ left: `clamp(0px, calc((100% - 3.5rem) * ${geo.xs[hover] / W} - 60px), calc(100% - 7rem - 120px))` }}>
            <div className="mb-0.5 opacity-70">{fmtFullDate(dates[hover])}</div>
            {series.map((s, i) => s.values[hover] === null ? null : (
              <div key={i} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} /><span className="money font-semibold">{fmt(s.values[hover] as number)}</span></div>
            ))}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between pr-14 text-[11px] text-muted sm:text-xs">{geo.labels.map((l, i) => <span key={i}>{l}</span>)}</div>
      {legend && (
        <div className="mt-3 flex flex-wrap justify-center gap-4 text-xs">
          {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}
