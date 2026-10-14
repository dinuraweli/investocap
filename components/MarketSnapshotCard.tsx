import type { MarketResponse } from "@/lib/api-types";
import { compact, fmtLKR, fmtPct, toneText } from "@/lib/format";
import { CardHeader, Skeleton } from "./ui";

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 80, cx = 100, cy = 100, arc = Math.PI * r;
  const frac = Math.min(Math.max(value / 10, 0), 1);
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="relative mx-auto w-full max-w-[260px]" role="img" aria-label={`Market breadth ${value.toFixed(1)} out of 10, ${label}`}>
      <svg viewBox="0 0 200 110" className="w-full">
        <defs>
          <linearGradient id="gauge" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#d92d3a" /><stop offset="40%" stopColor="#e8730c" /><stop offset="70%" stopColor="#0f9d6b" />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke="#eceef2" strokeWidth="14" strokeLinecap="round" />
        <path d={d} fill="none" stroke="url(#gauge)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${arc * frac} ${arc}`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="money text-3xl font-semibold leading-none">{value.toFixed(1)}</div>
        <div className="mt-1 text-sm text-muted">{label}</div>
      </div>
    </div>
  );
}

export default function MarketSnapshotCard({ market }: { market: MarketResponse | null }) {
  if (!market) return <section className="card space-y-3 p-5"><Skeleton className="h-6 w-32" /><Skeleton className="h-32" /><Skeleton className="h-24" /></section>;
  const { advancers, decliners } = market.breadth;
  // Breadth score: share of movers that are advancing, scaled to 0-10.
  const score = advancers + decliners > 0 ? (advancers / (advancers + decliners)) * 10 : 5;
  const label = score >= 6.5 ? "Broadly positive" : score >= 4 ? "Mixed" : "Broadly negative";
  const rows = [
    { label: "ASPI", value: fmtLKR(market.aspi.value, 2), delta: fmtPct(market.aspi.changePct), tone: market.aspi.changePct },
    { label: "S&P SL20", value: fmtLKR(market.sl20.value, 2), delta: fmtPct(market.sl20.changePct), tone: market.sl20.changePct },
    { label: "Turnover", value: `LKR ${compact(market.summary.turnover)}`, delta: "", tone: 0 },
    { label: "Up / Down", value: `${advancers} / ${decliners}`, delta: "", tone: 0 },
  ];
  return (
    <section className="card p-5">
      <CardHeader title="Market Pulse" action={<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${market.status.open ? "bg-gain-soft text-gain" : "bg-subtle text-muted"}`}>{market.status.status}</span>} />
      <div className="mt-2"><Gauge value={score} label={label} /></div>
      <dl className="mt-4 space-y-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between">
            <dt className="text-muted">{r.label}</dt>
            <dd className="flex items-center gap-3">
              <span className="money font-semibold">{r.value}</span>
              {r.delta && <span className={`w-16 text-right font-semibold ${toneText(r.tone)}`}>{r.delta}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
