"use client";
import { useMemo, useState } from "react";
import type { MarketResponse, PortfolioHistoryResponse, PortfolioResponse } from "@/lib/api-types";
import { fmtLKR, fmtSigned, toneBg, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import AreaChart from "./AreaChart";
import { useTrade } from "./Providers";
import { CardHeader, MoreButton, Segmented, Skeleton } from "./ui";

const RANGES = ["1W", "1M", "3M", "1Y", "All"] as const;

export default function PortfolioValueCard({ portfolio, market }: { portfolio: PortfolioResponse | null; market: MarketResponse | null }) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1M");
  const { openTrade } = useTrade();
  const hist = useApi<PortfolioHistoryResponse>(`/api/portfolio/history?range=${range.toUpperCase()}`, { refreshMs: 60000 });
  const points = useMemo(() => (hist.data?.points ?? []).map((p) => ({ t: Date.parse(p.date), v: p.value })), [hist.data]);

  const totals = portfolio?.totals;
  const [whole, cents] = (totals?.value ?? 0).toFixed(2).split(".");
  const empty = portfolio && portfolio.holdings.length === 0;

  return (
    <section className="card p-5">
      <CardHeader title="Portfolio Value" action={<MoreButton />} />
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {portfolio ? (
            <div className="money flex items-baseline gap-2 text-4xl font-semibold tracking-tight sm:text-5xl">
              <span className="text-2xl text-muted sm:text-3xl">LKR</span>
              <span>{fmtLKR(Number(whole))}<span className="text-xl text-muted sm:text-2xl">.{cents}</span></span>
            </div>
          ) : <Skeleton className="h-12 w-72" />}
          {totals && !empty && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`font-medium ${toneText(totals.dayChange)}`}>{totals.dayChange >= 0 ? "↑" : "↓"} {fmtSigned(totals.dayChange)}</span>
              <span className={`rounded-md px-2 py-0.5 font-semibold ${toneBg(totals.dayChange)}`}>{totals.dayChangePct >= 0 ? "+" : ""}{totals.dayChangePct.toFixed(2)}%</span>
              <span className="text-muted">Today · {market?.status.status ?? "..."}</span>
            </div>
          )}
        </div>
        <Segmented options={RANGES} value={range} onChange={setRange} />
      </div>

      <div className="mt-6">
        {empty ? (
          <div className="grid h-[240px] place-items-center rounded-xl bg-subtle text-center sm:h-[280px]">
            <div>
              <p className="font-semibold">No holdings yet</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">Record the trades you have made and InvestoCap will track their value, gains and allocation.</p>
              <button onClick={() => openTrade()} className="mt-4 h-10 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:opacity-90">Add your first trade</button>
            </div>
          </div>
        ) : hist.loading || !portfolio ? <Skeleton className="h-[240px] sm:h-[280px]" /> : points.length < 2 ? <div className="grid h-[240px] place-items-center rounded-xl bg-subtle px-6 text-center text-sm text-muted sm:h-[280px]">Your chart fills in as trading days pass. It needs at least two days of prices for what you hold.</div> : <AreaChart points={points} />}
      </div>

      {hist.data && !empty && points.length > 1 && (
        <p className="mt-4 text-sm text-muted">
          Over {range === "All" ? "all time" : range}, your return is{" "}
          <span className={`font-semibold ${toneText(hist.data.returnPct)}`}>{hist.data.returnPct >= 0 ? "+" : ""}{hist.data.returnPct.toFixed(2)}%</span>{" "}
          (<span className={toneText(hist.data.gain)}>{fmtSigned(hist.data.gain)} LKR</span>), not counting money you added or withdrew.
        </p>
      )}
    </section>
  );
}
