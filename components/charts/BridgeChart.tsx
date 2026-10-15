import { buildBridge } from "@/lib/reports/ratios";
import type { ReportAnalysis } from "@/lib/reports/analysis";
import { fmtChart } from "@/lib/ratioFormat";
import { scaleOf } from "./BarColumn";

/** Waterfall from revenue down to net profit. Totals stand on the baseline; costs hang off the level above. */
export default function BridgeChart({ analysis }: { analysis: ReportAnalysis }) {
  const steps = buildBridge(analysis);
  if (!steps) return null;

  // running level before/after each step, so every bar knows where to float
  let level = 0;
  const bars = steps.map((s) => {
    const from = s.kind === "total" ? 0 : level;
    const to = s.kind === "total" ? s.value : level + s.value;
    level = s.kind === "total" ? s.value : to;
    return { ...s, lo: Math.min(from, to), hi: Math.max(from, to) };
  });
  const { min, max } = scaleOf(bars.flatMap((b) => [b.lo, b.hi]));
  const span = max - min;
  const pctTop = (v: number) => ((max - v) / span) * 100;

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">From revenue to profit</h2>
      <p className="mt-0.5 text-sm text-muted">Where each rupee of revenue goes before it becomes profit. LKR million.</p>
      <div className="mt-4 overflow-x-auto">
        <div className="flex min-w-[520px] items-stretch gap-2" role="img" aria-label={`Bridge: ${bars.map((b) => `${b.label} ${fmtChart(b.value)}`).join(", ")}`}>
          {bars.map((b, i) => (
            <div key={i} className="flex flex-1 flex-col items-center">
              <div className="relative h-44 w-full">
                <div className="absolute inset-x-0 border-t border-line" style={{ top: `${pctTop(0)}%` }} />
                <div
                  className="absolute inset-x-[12%] rounded-[3px]"
                  style={{ top: `${pctTop(b.hi)}%`, height: `${Math.max(((b.hi - b.lo) / span) * 100, 0.8)}%`, background: b.kind === "total" ? "#3b2fe0" : b.value < 0 ? "#d92d3a" : "#0f9d6b" }}
                  title={`${b.label}: ${fmtChart(b.value)}`}
                />
              </div>
              <div className={`money mt-1 text-xs font-semibold ${b.kind === "delta" ? (b.value < 0 ? "text-loss" : "text-gain") : ""}`}>{b.kind === "delta" && b.value > 0 ? "+" : ""}{fmtChart(b.value)}</div>
              <div className="mt-0.5 text-center text-[11px] leading-tight text-muted">{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
