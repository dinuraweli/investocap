import { reader, growthPct } from "@/lib/reports/ratios";
import type { ReportAnalysis } from "@/lib/reports/analysis";
import { fmtChart } from "@/lib/ratioFormat";
import BarColumn, { scaleOf, ZeroLine } from "./BarColumn";

const PANELS: { key: string; label: string; perShare?: boolean }[] = [
  { key: "revenue", label: "Revenue" }, { key: "gross_profit", label: "Gross profit" }, { key: "operating_profit", label: "Operating profit" },
  { key: "net_profit", label: "Net profit" }, { key: "eps", label: "Earnings per share", perShare: true },
  { key: "total_operating_income", label: "Total operating income" }, { key: "net_interest_income", label: "Net interest income" },
];

/** This period against the comparative period printed in the same report, one small chart per line. */
export default function CompareBars({ analysis }: { analysis: ReportAnalysis }) {
  const read = reader(analysis);
  const prevLabel = analysis.metrics.find((m) => m.previousLabel)?.previousLabel ?? "Previous period";
  const panels = PANELS.map((p) => {
    const cur = read(p.key, "current");
    const prev = read(p.key, "previous");
    if (cur === null || prev === null) return null;
    const scale = p.perShare ? 1 : 1e6;
    return { ...p, cur: cur / scale, prev: prev / scale, growth: growthPct(cur, prev) };
  }).filter((p): p is NonNullable<typeof p> => !!p);
  if (panels.length === 0) return null;

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">This period vs last</h2>
      <p className="mt-0.5 text-sm text-muted">Compared with: {prevLabel}. Amounts in LKR million.</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {panels.map((p) => {
          const { min, max } = scaleOf([p.cur, p.prev]);
          return (
            <figure key={p.key} className="rounded-xl bg-subtle p-3" aria-label={`${p.label}: ${fmtChart(p.cur)} this period, ${fmtChart(p.prev)} previously`}>
              <figcaption className="text-xs font-medium text-muted">{p.label}</figcaption>
              <div className="relative mt-2 h-24">
                <ZeroLine min={min} max={max} />
                <div className="absolute inset-0 flex items-stretch justify-center gap-3">
                  {[{ v: p.prev, c: "#c9ccd6", t: "Before" }, { v: p.cur, c: "#3b2fe0", t: "Now" }].map((b) => (
                    <div key={b.t} className="relative w-1/3" title={`${b.t}: ${fmtChart(b.v)}`}><BarColumn value={b.v} min={min} max={max} color={b.c} className="inset-x-0" /></div>
                  ))}
                </div>
              </div>
              <div className="mt-2 flex justify-between text-xs"><span className="money text-muted">{fmtChart(p.prev)}</span><span className="money font-semibold">{fmtChart(p.cur)}</span></div>
              <div className={`mt-0.5 text-right text-xs font-semibold ${p.growth === null ? "text-muted" : p.growth >= 0 ? "text-gain" : "text-loss"}`}>{p.growth === null ? "" : `${p.growth >= 0 ? "+" : ""}${p.growth.toFixed(1)}%`}</div>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
