"use client";
import Link from "next/link";
import { useState } from "react";
import { ErrorNote, Segmented, Skeleton, StaleBanner } from "@/components/ui";
import type { FundsResponse } from "@/lib/api-types";
import { fmtPrice, timeAgo } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const TYPE_ORDER = ["Money Market", "Income", "Gilt", "Equity", "Balanced", "Index", "Shariah", "Other"];

export default function FundsPage() {
  const [type, setType] = useState("All");
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useApi<FundsResponse>(`/api/funds?${type === "All" ? "" : `type=${encodeURIComponent(type)}&`}q=${encodeURIComponent(q.trim())}`, { refreshMs: 300000 });

  const types = ["All", ...TYPE_ORDER.filter((t) => (data?.counts[t] ?? 0) > 0)];
  const label = (t: string) => (t === "All" ? `All (${data?.total ?? "…"})` : `${t} (${data?.counts[t] ?? 0})`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Unit trusts</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">Daily prices for Sri Lankan unit trusts{data ? ` — ${data.total} funds from ${data.managers} managers` : ""}. Source: Unit Trust Association of Sri Lanka (UTASL).</p>
        </div>
        {data && <p className="text-sm text-muted">Updated {timeAgo(data.fetchedAt)}</p>}
      </div>
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      <StaleBanner stale={data?.stale} />

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fund or manager" aria-label="Search funds" className="h-10 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15 sm:w-72" />
          {data && <Segmented options={types.map(label)} value={label(type)} onChange={(l) => setType(types.find((t) => label(t) === l) ?? "All")} size="sm" />}
        </div>
        {error ? null : !data ? <div className="space-y-2 p-5 pt-0"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
          : data.funds.length === 0 ? <p className="border-t border-line px-5 py-10 text-center text-sm text-muted">No funds match.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-subtle text-xs uppercase tracking-wide text-muted">
                    <th className="px-5 py-3 text-left font-medium">Fund</th>
                    <th className="px-3 py-3 text-left font-medium">Type</th>
                    <th className="px-3 py-3 text-right font-medium">Buying price</th>
                    <th className="px-5 py-3 text-right font-medium">Selling price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.funds.map((f) => (
                    <tr key={f.slug} className="border-t border-line hover:bg-subtle/60">
                      <td className="px-5 py-3">
                        <Link href={`/funds/${encodeURIComponent(f.slug)}`} className="block hover:text-brand">
                          <span className="font-semibold">{f.name}</span>
                          <span className="mt-0.5 block text-xs text-muted">{f.manager}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-3"><span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-muted">{f.type}</span></td>
                      <td className="money px-3 py-3 text-right text-muted">{fmtPrice(f.buy)}</td>
                      <td className="money px-5 py-3 text-right font-semibold">{fmtPrice(f.sell)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </section>
      <p className="text-xs text-muted">Prices are the latest published by UTASL and may be delayed. The selling price is what the manager redeems units at. For information only, not investment advice.</p>
    </div>
  );
}
