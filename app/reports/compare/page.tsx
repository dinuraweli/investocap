"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RatioRowCell } from "@/components/CompareCell";
import RequireAuth from "@/components/RequireAuth";
import { ErrorNote, Skeleton } from "@/components/ui";
import type { SavedAnalysis, StockResponse } from "@/lib/api-types";
import { shortSymbol } from "@/lib/format";
import { computeRatios, computeValuation, type RatioFormat } from "@/lib/reports/ratios";
import { useApi } from "@/lib/useApi";

const MAX = 3;

interface Column { symbol: string; name: string; latest: SavedAnalysis; ratios: ReturnType<typeof computeRatios>; valuation: ReturnType<typeof computeValuation>; price: number | null }
interface Row { key: string; label: string; format: RatioFormat; values: (number | null)[]; note?: string }

function Compare() {
  const all = useApi<{ analyses: SavedAnalysis[] }>("/api/reports/analyses");
  const [picked, setPicked] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, StockResponse["quote"]>>({});

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("symbols");
    if (q) setPicked(q.split(",").filter(Boolean).slice(0, MAX));
  }, []);
  const toggle = (s: string) => setPicked((cur) => {
    const next = cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < MAX ? [...cur, s] : cur;
    window.history.replaceState(null, "", next.length ? `?symbols=${next.join(",")}` : window.location.pathname);
    return next;
  });

  const bySymbol = useMemo(() => {
    const m = new Map<string, SavedAnalysis[]>();
    for (const a of all.data?.analyses ?? []) m.set(a.symbol, [...(m.get(a.symbol) ?? []), a]);
    return m;
  }, [all.data]);

  // fetch a live quote for each picked company (for valuation)
  useEffect(() => {
    let cancelled = false;
    picked.filter((s) => !quotes[s]).forEach((s) => {
      fetch(`/api/stocks/${encodeURIComponent(s)}`).then((r) => r.json()).then((d: StockResponse) => { if (!cancelled && d.quote) setQuotes((q) => ({ ...q, [s]: d.quote })); }).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [picked, quotes]);

  const columns: Column[] = picked.flatMap((s) => {
    const list = bySymbol.get(s);
    if (!list?.length) return [];
    const latest = [...list].filter((a) => a.analysis.periodEnd).sort((a, b) => (a.analysis.periodEnd! < b.analysis.periodEnd! ? 1 : -1))[0] ?? list[0];
    const q = quotes[s];
    return [{ symbol: s, name: q?.name ?? shortSymbol(s), latest, ratios: computeRatios(latest.analysis), valuation: computeValuation(list, q?.price ?? null, q?.marketCap ?? null), price: q?.price ?? null }];
  });

  // rows: valuation first, then every ratio group, by key across the chosen companies
  const sections: { title: string; rows: Row[] }[] = [];
  const addSection = (title: string, get: (c: Column) => { key: string; label: string; format: RatioFormat; value: number | null; note?: string }[]) => {
    const rows = new Map<string, Row>();
    columns.forEach((c, ci) => {
      for (const it of get(c)) {
        const row = rows.get(it.key) ?? { key: it.key, label: it.label, format: it.format, values: columns.map(() => null), note: it.note };
        row.values[ci] = it.value;
        rows.set(it.key, row);
      }
    });
    if (rows.size) sections.push({ title, rows: [...rows.values()] });
  };
  addSection("Valuation at today's price", (c) => c.valuation.items);
  for (const [id, title] of [["profitability", "Profitability and returns"], ["leverage", "Leverage and liquidity"], ["efficiency", "Cash flow and efficiency"], ["bank", "Bank measures"]] as const) {
    addSection(title, (c) => c.ratios.find((g) => g.id === id)?.items ?? []);
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted"><Link href="/reports" className="hover:text-ink">Reports</Link> / Compare</p>
        <h1 className="mt-1 text-xl font-semibold">Compare companies</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Pick up to {MAX} companies whose reports you have analysed. Each column uses that company&apos;s most recent analysed report.</p>
      </div>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Your analysed companies</h2>
        {all.error ? <div className="mt-3"><ErrorNote message={all.error.message} onRetry={all.reload} /></div>
          : !all.data ? <Skeleton className="mt-3 h-10" />
          : bySymbol.size === 0 ? <p className="mt-2 text-sm text-muted">You haven&apos;t analysed any reports yet. <Link href="/reports" className="font-medium text-brand">Analyse one first</Link>.</p>
          : (
            <div className="mt-3 flex flex-wrap gap-2">
              {[...bySymbol.keys()].sort().map((s) => {
                const on = picked.includes(s);
                return <button key={s} onClick={() => toggle(s)} aria-pressed={on} disabled={!on && picked.length >= MAX} className={`rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40 ${on ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface hover:bg-subtle"}`}>{shortSymbol(s)} <span className="font-normal text-muted">· {bySymbol.get(s)!.length} report{bySymbol.get(s)!.length === 1 ? "" : "s"}</span></button>;
              })}
            </div>
          )}
      </section>

      {!all.data && picked.length > 0 ? (
        <Skeleton className="h-64" />
      ) : columns.length < 2 ? (
        all.data && picked.length > 0 ? <p className="rounded-xl bg-subtle px-4 py-6 text-center text-sm text-muted">Pick at least two companies to compare.</p> : null
      ) : (
        <section className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-subtle align-bottom">
                  <th className="sticky left-0 z-10 w-[9.5rem] bg-subtle px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted sm:w-auto sm:px-5">Measure</th>
                  {columns.map((c) => (
                    <th key={c.symbol} className="px-2 py-3 text-right sm:px-3">
                      <Link href={`/reports/${encodeURIComponent(c.symbol)}`} className="block font-semibold hover:text-brand">{shortSymbol(c.symbol)}</Link>
                      <span className="block text-[11px] font-normal text-muted">{c.latest.analysis.periodLabel}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map((sec) => (
                  <RatioSection key={sec.title} title={sec.title} rows={sec.rows} cols={columns.length} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-muted">Companies may report different periods and use different accounting years, so compare with care. Ratios are calculated by InvestoCap from each company&apos;s own report. For information only, not investment advice.</p>
        </section>
      )}
    </div>
  );
}

function RatioSection({ title, rows, cols }: { title: string; rows: Row[]; cols: number }) {
  return (
    <>
      <tr><td colSpan={cols + 1} className="bg-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted sm:px-5">{title}</td></tr>
      {rows.map((r) => (
        <tr key={r.key} className="border-t border-line">
          <td className="sticky left-0 z-10 w-[9.5rem] bg-surface px-3 py-2.5 text-[13px] leading-tight text-muted sm:w-auto sm:px-5 sm:text-sm" title={r.note}>{r.label}</td>
          {r.values.map((v, i) => <RatioRowCell key={i} value={v} format={r.format} all={r.values} />)}
        </tr>
      ))}
    </>
  );
}

export default function ComparePage() {
  return <RequireAuth><Compare /></RequireAuth>;
}
