import type { PortfolioResponse } from "@/lib/api-types";
import { sectorColor } from "@/lib/colors";
import { fmtLKR } from "@/lib/format";
import { CardHeader, Skeleton } from "./ui";

function Donut({ alloc, count }: { alloc: PortfolioResponse["allocation"]; count: number }) {
  const r = 52, c = 2 * Math.PI * r, gap = alloc.length > 1 ? 3 : 0;
  let offset = 0;
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0 sm:h-44 sm:w-44">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Allocation by sector">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#eceef2" strokeWidth="13" />
        {alloc.map((a) => {
          const len = Math.max((a.pct / 100) * c - gap, 0);
          const el = <circle key={a.sector} cx="70" cy="70" r={r} fill="none" stroke={sectorColor(a.sector)} strokeWidth="13" strokeLinecap="round" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
          offset += (a.pct / 100) * c;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className="money text-lg font-semibold">{count} {count === 1 ? "asset" : "assets"}</div><div className="text-sm text-muted">{alloc.length} {alloc.length === 1 ? "sector" : "sectors"}</div></div>
      </div>
    </div>
  );
}

export default function AllocationCard({ portfolio }: { portfolio: PortfolioResponse | null }) {
  return (
    <section className="card p-5">
      <CardHeader title="Asset Allocation" />
      {!portfolio ? <Skeleton className="mt-5 h-44" /> : portfolio.allocation.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Allocation appears once you hold something.</p>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
          <Donut alloc={portfolio.allocation} count={portfolio.holdings.length} />
          <ul className="w-full space-y-2.5 text-sm">
            {portfolio.allocation.map((a) => (
              <li key={a.sector} className="flex items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: sectorColor(a.sector) }} />
                <span className="flex-1 truncate">{a.sector}</span>
                <span className="money font-semibold">{fmtLKR(a.value)}</span>
                <span className="w-10 text-right text-muted">{a.pct.toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
