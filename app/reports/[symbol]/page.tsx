"use client";
import Link from "next/link";
import { use, useEffect, useMemo, useRef, useState } from "react";
import AnalysisView from "@/components/AnalysisView";
import GeminiKeyCard from "@/components/GeminiKeyCard";
import RequireAuth from "@/components/RequireAuth";
import { ErrorNote, Segmented, Skeleton } from "@/components/ui";
import type { CompanyReport, ReportsResponse, SavedAnalysis } from "@/lib/api-types";
import { shortSymbol } from "@/lib/format";
import { useGeminiKey } from "@/lib/geminiKey";
import { apiPost, useApi } from "@/lib/useApi";

const KINDS = ["Quarterly", "Annual", "Other"] as const;
const kindOf = { Quarterly: "quarterly", Annual: "annual", Other: "other" } as const;

function Page({ symbol }: { symbol: string }) {
  const key = useGeminiKey();
  const list = useApi<ReportsResponse>(`/api/reports/${encodeURIComponent(symbol)}`);
  const saved = useApi<{ analyses: SavedAnalysis[] }>(`/api/reports/analyses?symbol=${encodeURIComponent(symbol)}`);
  const [tab, setTab] = useState<(typeof KINDS)[number]>("Quarterly");
  const [openId, setOpenId] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Record<number, SavedAnalysis>>({}); // analyses finished in this session
  const [running, setRunning] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => {
    const m = new Map<number, SavedAnalysis>();
    for (const s of saved.data?.analyses ?? []) m.set(s.reportId, s);
    for (const s of Object.values(fresh)) m.set(s.reportId, s);
    return m;
  }, [saved.data, fresh]);

  // Deep link from "Your analyses": ?open=<reportId>
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("open"));
    if (id) setOpenId(id);
  }, []);

  const counts = useMemo(() => Object.fromEntries(KINDS.map((k) => [k, (list.data?.reports ?? []).filter((r) => r.kind === kindOf[k]).length])), [list.data]);
  const rows = (list.data?.reports ?? []).filter((r) => r.kind === kindOf[tab]);
  const current = openId !== null ? byId.get(openId) : undefined;
  useEffect(() => { if (current) panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [current?.reportId]); // bring a freshly opened analysis into view

  async function analyse(r: CompanyReport, force = false) {
    if (!key) { setError("Add your Gemini API key first."); return; }
    setError(null);
    setRunning(r.id);
    try {
      const result = await apiPost<SavedAnalysis>("/api/reports/analyse", { symbol, reportId: r.id, force }, { "x-gemini-key": key.key });
      setFresh((f) => ({ ...f, [r.id]: result }));
      setOpenId(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }

  if (list.error?.status === 404) return <div className="card p-8 text-center"><h1 className="text-lg font-semibold">We couldn&apos;t find &ldquo;{symbol}&rdquo;</h1><Link href="/reports" className="mt-2 inline-block text-sm font-medium text-brand">Back to reports</Link></div>;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted"><Link href="/reports" className="hover:text-ink">Reports</Link> / {shortSymbol(symbol)}</p>
        <h1 className="mt-1 text-xl font-semibold">{list.data?.name ?? shortSymbol(symbol)}</h1>
        <Link href={`/stocks/${encodeURIComponent(symbol)}`} className="text-sm font-medium text-brand hover:underline">View price and chart</Link>
      </div>

      <GeminiKeyCard />
      {error && <ErrorNote message={error} />}

      {running !== null && (
        <div role="status" className="card flex items-center gap-3 p-5 text-sm">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span>Downloading the report from the CSE and reading it with Gemini. This usually takes 20 to 90 seconds. Please keep this page open.</span>
        </div>
      )}

      {current && (
        <div ref={panel} className="scroll-mt-4">
          <div className="mb-3 flex items-center justify-between">
            <button onClick={() => setOpenId(null)} className="text-sm font-medium text-brand hover:underline">Close analysis</button>
            <button onClick={() => { const r = list.data?.reports.find((x) => x.id === current.reportId); if (r) analyse(r, true); }} disabled={running !== null || !key} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-subtle disabled:opacity-50">Re-run analysis</button>
          </div>
          <AnalysisView saved={current} />
        </div>
      )}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <h2 className="text-[15px] font-semibold">Reports filed with the CSE</h2>
          <Segmented options={KINDS.map((k) => k) as unknown as readonly (typeof KINDS)[number][]} value={tab} onChange={setTab} />
        </div>
        {list.error ? <div className="p-5 pt-0"><ErrorNote message={list.error.message} onRetry={list.reload} /></div>
          : !list.data ? <div className="space-y-2 p-5 pt-0"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : rows.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-sm text-muted">No {tab.toLowerCase()} reports found ({counts.Quarterly} quarterly, {counts.Annual} annual, {counts.Other} other).</p>
          : (
            <ul>
              {rows.map((r) => {
                const done = byId.get(r.id);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{r.title}</div>
                      <div className="mt-0.5 text-xs text-muted">{r.date ?? "No date"}{done ? " · analysed" : ""}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <a href={`https://cdn.cse.lk/${r.path}`} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 font-medium text-muted hover:bg-subtle">PDF</a>
                      {done ? (
                        <button onClick={() => setOpenId(r.id)} className="rounded-xl border border-line px-4 py-2 font-semibold hover:bg-subtle">View analysis</button>
                      ) : (
                        <button onClick={() => analyse(r)} disabled={running !== null || !key} title={key ? undefined : "Add your Gemini key first"} className="rounded-xl bg-brand px-4 py-2 font-semibold text-white hover:opacity-90 disabled:opacity-50">{running === r.id ? "Analysing..." : "Analyse"}</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
    </div>
  );
}

export default function ReportsForSymbol({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  return <RequireAuth><Page symbol={decodeURIComponent(symbol)} /></RequireAuth>;
}
