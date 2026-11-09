"use client";
import Link from "next/link";
import { useMemo } from "react";
import AreaChart from "@/components/AreaChart";
import { useAuth } from "@/components/Providers";
import { ErrorNote, Skeleton, StaleBanner } from "@/components/ui";
import type { HoldingEvent, SentimentHoldingsResponse, SentimentResponse } from "@/lib/api-types";
import { compact, fmtIsoDate, fmtLKR, fmtPct, sentenceCase, shortSymbol, timeAgo, toneBg, toneText } from "@/lib/format";
import { useApi } from "@/lib/useApi";

const scoreColor = (s: number) => (s >= 60 ? "#0f9d6b" : s >= 40 ? "#e8730c" : "#d92d3a");

/** Semicircle gauge for the 0–100 mood score. */
function Gauge({ score, label }: { score: number; label: string }) {
  const r = 80, cx = 100, cy = 100, arc = Math.PI * r;
  const frac = Math.min(Math.max(score / 100, 0), 1);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="relative mx-auto w-full max-w-[280px]" role="img" aria-label={`Market mood ${score} out of 100, ${label}`}>
      <svg viewBox="0 0 200 116" className="w-full">
        <defs>
          <linearGradient id="mood" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stopColor="#d92d3a" /><stop offset="50%" stopColor="#e8730c" /><stop offset="100%" stopColor="#0f9d6b" /></linearGradient>
        </defs>
        <path d={d} fill="none" stroke="#eceef2" strokeWidth="15" strokeLinecap="round" />
        <path d={d} fill="none" stroke="url(#mood)" strokeWidth="15" strokeLinecap="round" strokeDasharray={`${arc * frac} ${arc}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="money text-4xl font-semibold leading-none" style={{ color: scoreColor(score) }}>{score}</div>
        <div className="mt-1 text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">out of 100</div>
      </div>
    </div>
  );
}

function Pair({ label, up, down, upLabel, fmt = (n: number) => fmtLKR(n) }: { label: string; up: number; down: number; upLabel: string; fmt?: (n: number) => string }) {
  const total = up + down;
  const pct = total > 0 ? (up / total) * 100 : 50;
  return (
    <div className="rounded-xl bg-subtle p-3">
      <div className="flex items-center justify-between text-xs text-muted"><span>{label}</span><span className="font-semibold text-gain">{Math.round(pct)}% {upLabel}</span></div>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-loss/30"><div className="h-full bg-gain" style={{ width: `${pct}%` }} /></div>
      <div className="money mt-1.5 flex justify-between text-xs"><span className="text-gain">{fmt(up)}</span><span className="text-loss">{fmt(down)}</span></div>
    </div>
  );
}

function DealingsCard({ data }: { data: SentimentResponse["dealings"] }) {
  if (!data) return <section className="card p-5"><h2 className="text-[15px] font-semibold">Director dealings</h2><p className="mt-2 text-sm text-muted">Insider-dealing data isn&apos;t available right now.</p></section>;
  const biasText = data.bias === "buying" ? "Directors were net buyers" : data.bias === "selling" ? "Directors were net sellers" : "Director buying and selling was balanced";
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[15px] font-semibold">Director dealings</h2><p className="mt-0.5 text-sm text-muted">Insider trades reported {data.from ? `${fmtIsoDate(data.from)} – ${fmtIsoDate(data.to)}` : "recently"}.</p></div>
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${data.bias === "buying" ? "bg-gain-soft text-gain" : data.bias === "selling" ? "bg-loss-soft text-loss" : "bg-subtle text-muted"}`}>{biasText}</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-subtle px-2 py-3"><div className="text-xs text-muted">Net value</div><div className={`money mt-1 font-semibold ${toneText(data.netValue)}`}>{data.netValue >= 0 ? "+" : "−"}LKR {compact(Math.abs(data.netValue))}</div></div>
        <div className="rounded-xl bg-subtle px-2 py-3"><div className="text-xs text-muted">Bought</div><div className="money mt-1 font-semibold text-gain">LKR {compact(data.buyValue)}</div><div className="text-xs text-muted">{data.buyCount} filing{data.buyCount === 1 ? "" : "s"}</div></div>
        <div className="rounded-xl bg-subtle px-2 py-3"><div className="text-xs text-muted">Sold</div><div className="money mt-1 font-semibold text-loss">LKR {compact(data.sellValue)}</div><div className="text-xs text-muted">{data.sellCount} filing{data.sellCount === 1 ? "" : "s"}</div></div>
      </div>
      {data.lines.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {data.lines.slice(0, 8).map((l) => (
            <li key={l.announcementId} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0"><span className="block truncate font-medium">{l.company}</span><span className="text-xs text-muted">{l.director ?? "Director"}{l.date ? ` · ${fmtIsoDate(l.date)}` : ""}</span></span>
              <span className={`money shrink-0 font-semibold ${toneText(l.value)}`}>{l.side === "mixed" ? "" : l.value >= 0 ? "Bought " : "Sold "}{l.value >= 0 ? "+" : "−"}LKR {compact(Math.abs(l.value))}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted">Directors buying their own company&apos;s shares can signal confidence, and selling the opposite — but there are many innocent reasons to trade. Descriptive only, not advice.</p>
    </section>
  );
}

function HoldingsEvents() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<SentimentHoldingsResponse>(user ? "/api/sentiment/holdings" : null);
  if (!user) return (
    <section className="card p-5"><h2 className="text-[15px] font-semibold">News impact on your holdings</h2><p className="mt-2 text-sm text-muted"><Link href="/" className="font-medium text-brand hover:underline">Sign in</Link> to see how recent announcements moved the stocks you own.</p></section>
  );
  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">News impact on your holdings</h2>
      <p className="mt-0.5 text-sm text-muted">Each holding&apos;s most recent CSE announcement and how the share price reacted after it (close before vs ~5 trading days later).</p>
      {loading ? <Skeleton className="mt-3 h-28" /> : error ? <div className="mt-3"><ErrorNote message={error.message} /></div>
        : !data || data.events.length === 0 ? <p className="mt-3 text-sm text-muted">{data && data.held === 0 ? "You have no holdings yet." : "No recent announcements for your holdings in the last 90 days."}</p>
        : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.events.map((e: HoldingEvent) => (
              <li key={e.symbol} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <Link href={`/stocks/${encodeURIComponent(e.symbol)}#announcements`} className="font-semibold hover:text-brand">{shortSymbol(e.symbol)}</Link>
                  <span className="ml-2 text-muted">{sentenceCase(e.announcement.category)}</span>
                  <span className="block text-xs text-muted">{fmtIsoDate(e.announcement.date)}{e.reaction.settled ? "" : " · still settling"}</span>
                </span>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold ${toneBg(e.reaction.pct)}`}>{fmtPct(e.reaction.pct)}</span>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-3 text-xs text-muted">Price moves have many causes; a reaction after an announcement is not proof the news caused it.</p>
    </section>
  );
}

export default function SentimentPage() {
  const { data, error, loading, reload } = useApi<SentimentResponse>("/api/sentiment", { refreshMs: 30000 });
  const trend = useMemo(() => (data?.history ?? []).map((h) => ({ t: Date.parse(`${h.date}T00:00:00+05:30`), v: h.score })), [data]);
  const b = data?.breadth;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Market sentiment</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">How broad today&apos;s move is across the whole market, what directors are doing, and how news has moved your stocks. Descriptive only — not investment advice.</p>
        </div>
        {data && <p className="text-sm text-muted">Updated {timeAgo(data.fetchedAt)}</p>}
      </div>
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      <StaleBanner stale={data?.stale} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Market mood</h2>
          {b ? (
            <>
              <div className="mt-2"><Gauge score={b.score} label={b.label} /></div>
              <p className="mt-3 text-center text-sm text-muted">A blend of how many stocks rose vs fell, where the volume and money went, and how many sectors are up.</p>
            </>
          ) : <Skeleton className="mt-3 h-44" />}
        </section>

        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">Breadth today</h2>
          {b ? (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-gain-soft px-2 py-3"><div className="money text-xl font-semibold text-gain">{b.advancers}</div><div className="text-xs text-muted">advancing</div></div>
                <div className="rounded-xl bg-loss-soft px-2 py-3"><div className="money text-xl font-semibold text-loss">{b.decliners}</div><div className="text-xs text-muted">declining</div></div>
                <div className="rounded-xl bg-subtle px-2 py-3"><div className="money text-xl font-semibold">{b.adRatio === null ? "–" : b.adRatio.toFixed(2)}</div><div className="text-xs text-muted">A/D ratio</div></div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Pair label="Volume" up={b.upVolume} down={b.downVolume} upLabel="in risers" fmt={(n) => compact(n)} />
                <Pair label="Turnover" up={b.upTurnover} down={b.downTurnover} upLabel="in risers" fmt={(n) => `Rs ${compact(n)}`} />
                <Pair label="Sectors" up={b.sectorsUp} down={b.sectorsDown} upLabel="green" fmt={(n) => String(n)} />
              </div>
            </div>
          ) : <Skeleton className="mt-3 h-40" />}
        </section>
      </div>

      <section className="card p-5">
        <h2 className="text-[15px] font-semibold">Mood over time</h2>
        <p className="mt-0.5 text-sm text-muted">The daily mood score (0–100). Builds up from InvestoCap&apos;s daily snapshots.</p>
        <div className="mt-4">
          {!data ? <Skeleton className="h-[220px]" /> : trend.length < 2 ? <div className="grid h-[220px] place-items-center rounded-xl bg-subtle px-6 text-center text-sm text-muted">The trend builds from here — it needs at least two days of snapshots. Check back tomorrow.</div> : <AreaChart points={trend} height="h-[220px] sm:h-[240px]" color="#3b2fe0" />}
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <DealingsCard data={data?.dealings ?? null} />
        <HoldingsEvents />
      </div>
    </div>
  );
}
