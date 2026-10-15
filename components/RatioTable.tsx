import type { RatioGroup, RatioItem } from "@/lib/reports/ratios";
import { fmtRatio } from "@/lib/ratioFormat";

export function RatioRow({ r, showPrevious = true }: { r: RatioItem; showPrevious?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 text-sm">
      <dt className="text-muted" title={r.note}>{r.label}{r.note && <span className="ml-1 cursor-help text-[11px] text-muted/70" aria-hidden>ⓘ</span>}</dt>
      <dd className="money text-right font-semibold">
        {r.value === null && r.note ? <span className="font-normal text-muted">{r.note}</span> : fmtRatio(r.value, r.format)}
        {showPrevious && r.previous !== null && <span className="ml-2 font-normal text-muted">(was {fmtRatio(r.previous, r.format)})</span>}
      </dd>
    </div>
  );
}

/** Ratio groups from one report. Previous values are the comparative column printed in the same report. */
export default function RatioTable({ groups, title = "Ratios", subtitle }: { groups: RatioGroup[]; title?: string; subtitle?: string }) {
  if (groups.length === 0) return null;
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <p className="mt-0.5 text-sm text-muted">{subtitle ?? "Calculated by InvestoCap from the figures in the report. Hover a label for how it is worked out."}</p>
      <div className="mt-3 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
            <dl>{g.items.map((r) => <RatioRow key={r.key} r={r} />)}</dl>
          </div>
        ))}
      </div>
    </section>
  );
}
