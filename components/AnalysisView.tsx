import type { SavedAnalysis } from "@/lib/api-types";
import type { AuditorOpinion, Metric, Severity } from "@/lib/reports/analysis";
import { computeRatios, growthPct } from "@/lib/reports/ratios";
import BridgeChart from "./charts/BridgeChart";
import CompareBars from "./charts/CompareBars";
import RatioTable from "./RatioTable";
import { fmtFullDate, fmtLKR, toneText } from "@/lib/format";

// Whole numbers print plainly (800, 12,500); fractions keep two decimals (0.07, 3.10).
const fmtNum = (n: number | null) => (n === null ? "–" : Number.isInteger(n) ? fmtLKR(n, 0) : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const AUDITOR: Record<AuditorOpinion, { label: string; tone: string }> = {
  unqualified: { label: "Clean (unqualified) opinion", tone: "bg-gain-soft text-gain" },
  qualified: { label: "Qualified opinion", tone: "bg-[#fff4e5] text-warn" },
  adverse: { label: "Adverse opinion", tone: "bg-loss-soft text-loss" },
  disclaimer: { label: "Disclaimer of opinion", tone: "bg-loss-soft text-loss" },
  not_included: { label: "No audit report in this document", tone: "bg-subtle text-muted" },
  unclear: { label: "Audit opinion unclear", tone: "bg-subtle text-muted" },
};
const SEVERITY: Record<Severity, string> = { high: "bg-loss-soft text-loss", medium: "bg-[#fff4e5] text-warn", low: "bg-subtle text-muted" };

function Change({ m }: { m: Metric }) {
  if (m.current === null || m.previous === null) return <span className="text-muted">–</span>;
  if (m.unit.trim() === "%") {
    const d = m.current - m.previous; // a ratio: show the point difference, not a % of a %
    return <span className={toneText(d)}>{d >= 0 ? "+" : ""}{d.toFixed(2)} pts</span>;
  }
  const g = growthPct(m.current, m.previous);
  if (g === null) {
    const d = m.current - m.previous;
    return <span className={toneText(d)} title="Percentage change isn't meaningful across zero or a loss">{d >= 0 ? "+" : ""}{fmtNum(d)}</span>;
  }
  return <span className={toneText(g)}>{g >= 0 ? "+" : ""}{g.toFixed(1)}%</span>;
}

const Page = ({ n }: { n: number | null }) => (n ? <span className="ml-2 whitespace-nowrap rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted">p.{n}</span> : null);

export default function AnalysisView({ saved }: { saved: SavedAnalysis }) {
  const a = saved.analysis;
  const ratios = computeRatios(a);
  const aud = AUDITOR[a.auditor.opinion];
  const prevLabel = a.metrics.find((m) => m.previousLabel)?.previousLabel ?? "Previous";

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#fff4e5] px-4 py-3 text-sm text-warn">
        AI-generated from the report. It can make mistakes, so check anything important against the original PDF. For information only, not investment advice.
      </div>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{a.periodLabel}</h2>
            <p className="mt-1 text-sm text-muted">
              {saved.title}{a.scope ? ` · ${a.scope}` : ""} · {a.currency} · analysed {fmtFullDate(Date.parse(saved.createdAt))} with {saved.model}
            </p>
          </div>
          <a href={`https://cdn.cse.lk/${saved.pdfPath}`} target="_blank" rel="noreferrer" className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle">Open original PDF</a>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed">{a.summary}</p>
      </section>

      {a.metrics.length > 0 && (
        <section className="card overflow-hidden">
          <div className="p-5 pb-3"><h2 className="text-[15px] font-semibold">Key numbers</h2><p className="mt-0.5 text-sm text-muted">Read directly from the report. Units are as printed.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="bg-subtle text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 text-left font-medium">Metric</th>
                <th className="px-3 py-2.5 text-right font-medium">This period</th>
                <th className="px-3 py-2.5 text-right font-medium">{prevLabel}</th>
                <th className="px-5 py-2.5 text-right font-medium">Change</th>
              </tr></thead>
              <tbody>
                {a.metrics.map((m) => (
                  <tr key={m.key} className="border-t border-line">
                    <td className="px-5 py-3"><span className="font-medium">{m.label}</span><span className="ml-2 text-xs text-muted">{m.unit}</span><Page n={m.page} /></td>
                    <td className="money px-3 py-3 text-right font-semibold">{fmtNum(m.current)}</td>
                    <td className="money px-3 py-3 text-right text-muted">{fmtNum(m.previous)}</td>
                    <td className="px-5 py-3 text-right font-medium"><Change m={m} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <CompareBars analysis={a} />
      <BridgeChart analysis={a} />
      <RatioTable groups={ratios} subtitle={`Calculated by InvestoCap from this report (${a.periodLabel}). Hover a label to see how it is worked out.`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Highlights</h2>
          {a.highlights.length === 0 ? <p className="mt-2 text-sm text-muted">Nothing notable was flagged.</p> : (
            <ul className="mt-3 space-y-2.5 text-sm">{a.highlights.map((h, i) => <li key={i} className="flex gap-2"><span className="text-gain">▲</span><span>{h.text}<Page n={h.page} /></span></li>)}</ul>
          )}
        </section>
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Things to check</h2>
          {a.risks.length === 0 ? <p className="mt-2 text-sm text-muted">No specific concerns were flagged.</p> : (
            <ul className="mt-3 space-y-2.5 text-sm">{a.risks.map((r, i) => (
              <li key={i} className="flex gap-2"><span className={`mt-0.5 h-fit rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${SEVERITY[r.severity]}`}>{r.severity}</span><span>{r.text}<Page n={r.page} /></span></li>
            ))}</ul>
          )}
        </section>
      </div>

      <section className="card space-y-3 p-5 text-sm">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-[15px] font-semibold">Auditor</h2><span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${aud.tone}`}>{aud.label}</span></div>
        {a.auditor.note && <p className="text-muted">{a.auditor.note}</p>}
        {a.outlook && <div><h3 className="font-semibold">Outlook (as stated by management)</h3><p className="mt-1 text-muted">{a.outlook}</p></div>}
        {a.notes.length > 0 && <div><h3 className="font-semibold">Notes on the data</h3><ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{a.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></div>}
        <p className="text-xs text-muted">Page numbers refer to pages of the PDF file, which may differ from the numbers printed on the pages.</p>
      </section>
    </div>
  );
}
