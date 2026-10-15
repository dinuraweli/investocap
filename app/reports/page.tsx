"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import SearchBox from "@/components/SearchBox";
import { ErrorNote, Skeleton } from "@/components/ui";
import type { SavedAnalysis } from "@/lib/api-types";
import { shortSymbol } from "@/lib/format";
import { useApi } from "@/lib/useApi";

function Home() {
  const router = useRouter();
  const saved = useApi<{ analyses: SavedAnalysis[] }>("/api/reports/analyses");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Report analyser</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Pick a company to see the financial reports it has filed with the CSE. One click turns a long PDF into a plain-English summary, the key numbers and the things worth checking.</p>
      </div>
      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Find a company</h2>
        <SearchBox className="mt-3 max-w-md" placeholder="Search by name or symbol" onPick={(s) => router.push(`/reports/${encodeURIComponent(s)}`)} />
      </section>

      <section className="card overflow-hidden">
        <div className="p-5 pb-3"><h2 className="text-[15px] font-semibold">Your analyses</h2></div>
        {saved.error ? <div className="p-5 pt-0"><ErrorNote message={saved.error.message} onRetry={saved.reload} /></div>
          : !saved.data ? <div className="space-y-2 p-5 pt-0"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : saved.data.analyses.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-sm text-muted">Nothing yet. Analyse a report and it will be saved here.</p>
          : (
            <ul>
              {saved.data.analyses.map((s) => (
                <li key={s.reportId} className="border-t border-line">
                  <Link href={`/reports/${encodeURIComponent(s.symbol)}?open=${s.reportId}`} className="flex items-center justify-between gap-3 px-5 py-3.5 text-sm hover:bg-subtle/60">
                    <span className="min-w-0"><span className="font-semibold">{shortSymbol(s.symbol)}</span><span className="ml-2 text-muted">{s.analysis.periodLabel}</span></span>
                    <span className="shrink-0 text-xs text-muted">{s.reportDate ?? ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

export default function ReportsHome() {
  return <RequireAuth><Home /></RequireAuth>;
}
