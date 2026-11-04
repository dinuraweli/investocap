"use client";
import Link from "next/link";
import { use, useMemo } from "react";
import AreaChart from "@/components/AreaChart";
import { ErrorNote, Skeleton } from "@/components/ui";
import type { FundResponse } from "@/lib/api-types";
import { fmtIsoDate, fmtPrice } from "@/lib/format";
import { useApi } from "@/lib/useApi";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="card p-4"><div className="text-xs text-muted">{label}</div><div className="money mt-1 text-xl font-semibold">{value}</div></div>;
}

export default function FundPage({ params }: { params: Promise<{ slug: string }> }) {
  const slug = decodeURIComponent(use(params).slug);
  const { data, error, loading, reload } = useApi<FundResponse>(`/api/funds/${encodeURIComponent(slug)}`, { refreshMs: 300000 });
  const points = useMemo(() => (data?.history ?? []).map((h) => ({ t: Date.parse(`${h.date}T00:00:00+05:30`), v: h.sell })), [data]);

  if (error?.status === 404) return <div className="card p-8 text-center"><h1 className="text-lg font-semibold">Fund not found</h1><Link href="/funds" className="mt-2 inline-block text-sm font-medium text-brand">Back to unit trusts</Link></div>;
  if (error) return <ErrorNote message={error.message} onRetry={reload} />;
  if (loading || !data) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  const f = data.fund;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted"><Link href="/funds" className="hover:text-ink">Unit trusts</Link> / {f.type}</p>
        <h1 className="mt-1 text-xl font-semibold">{f.name}</h1>
        <p className="text-sm text-muted">{f.manager}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Selling price (NAV)" value={`Rs. ${fmtPrice(f.sell)}`} />
        <Stat label="Buying price" value={`Rs. ${fmtPrice(f.buy)}`} />
        <Stat label="Type" value={<span className="text-base">{f.type}</span>} />
      </div>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">NAV history</h2>
        <p className="mt-0.5 text-sm text-muted">Selling price over time, from InvestoCap&apos;s daily snapshots since this fund was first seen.</p>
        <div className="mt-4">
          {points.length < 2 ? <div className="grid h-[240px] place-items-center rounded-xl bg-subtle px-6 text-center text-sm text-muted">History builds up from here — it needs at least two days of snapshots. Check back tomorrow.</div> : <AreaChart points={points} decimals={2} color="#0f9d6b" />}
        </div>
        {points.length >= 1 && <p className="mt-2 text-xs text-muted">Earliest snapshot: {fmtIsoDate(data.history[0].date)}.</p>}
      </section>
      <p className="text-xs text-muted">Source: UTASL. Prices may be delayed. For information only, not investment advice.</p>
    </div>
  );
}
