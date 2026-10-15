"use client";
import type { TrendPoint } from "@/lib/reports/ratios";
import { fmtChart } from "@/lib/ratioFormat";
import BarColumn, { scaleOf, ZeroLine } from "./BarColumn";

/** One bar per period. `fmt` formats the value labels (e.g. add a % sign). Scrolls sideways when there are many periods. */
export default function TrendChart({ points, metric, fmt = fmtChart, color = "#3b2fe0" }: { points: TrendPoint[]; metric: string; fmt?: (v: number) => string; color?: string }) {
  const series = points.filter((p) => p.values[metric] !== undefined).map((p) => ({ label: p.label, v: p.values[metric], estimated: p.source === "history" }));
  if (series.length < 2) return <div className="grid h-40 place-items-center rounded-xl bg-subtle px-6 text-center text-sm text-muted">Needs at least two periods of data for this line. Analyse more reports to fill it in.</div>;
  const { min, max } = scaleOf(series.map((s) => s.v));
  const showValues = series.length <= 10;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-stretch gap-1.5" style={{ minWidth: `${series.length * 46}px` }} role="img" aria-label={`Trend: ${series.map((s) => `${s.label} ${fmt(s.v)}`).join(", ")}`}>
        {series.map((s) => (
          <div key={s.label} className="flex flex-1 flex-col items-center" title={`${s.label}: ${fmt(s.v)}${s.estimated ? " (from the report's summary table)" : ""}`}>
            <div className={`money h-5 text-[11px] font-semibold ${showValues ? "" : "invisible"}`}>{showValues ? fmt(s.v) : ""}</div>
            <div className="relative h-40 w-full">
              <ZeroLine min={min} max={max} />
              <BarColumn value={s.v} min={min} max={max} color={s.estimated ? `${color}99` : color} className="inset-x-[18%]" />
            </div>
            <div className="mt-1 text-[11px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
