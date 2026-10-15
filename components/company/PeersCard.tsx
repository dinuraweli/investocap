"use client";
import Link from "next/link";
import { compact, fmtPct, fmtPrice, shortSymbol, toneText } from "@/lib/format";
import type { PeerRow } from "@/lib/cse/peers";
import { useApi } from "@/lib/useApi";
import { Skeleton } from "../ui";

interface PeersResponse { sector: string | null; peers: PeerRow[]; total: number; known: number; all: number; unavailable?: boolean }

/** Other companies in the same CSE sector. The sector list fills in over time, so coverage is shown honestly. */
export default function PeersCard({ symbol }: { symbol: string }) {
  const { data, loading } = useApi<PeersResponse>(`/api/companies/${encodeURIComponent(symbol)}/peers`);
  const filling = !!data && data.all > 0 && data.known < data.all * 0.9;

  return (
    <section className="card p-5">
      <h2 className="text-[15px] font-semibold">{data?.sector ? `Peers in ${data.sector}` : "Peers"}</h2>
      {loading ? <Skeleton className="mt-4 h-32" /> : !data || data.unavailable || !data.sector ? (
        <p className="mt-2 text-sm text-muted">Sector peers aren&apos;t available for this company right now.</p>
      ) : data.peers.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No other listed companies found in this sector yet{filling ? ", but sector data is still being collected. Check back soon." : "."}</p>
      ) : (
        <>
          <p className="mt-0.5 text-sm text-muted">The largest of {data.total - 1} other companies in this sector, by market value.</p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[340px] text-sm">
              <tbody>
                {data.peers.map((p) => (
                  <tr key={p.symbol} className="border-t border-line first:border-t-0">
                    <td className="py-2.5"><Link href={`/stocks/${encodeURIComponent(p.symbol)}`} className="block hover:text-brand"><span className="font-semibold">{shortSymbol(p.symbol)}</span><span className="block max-w-[220px] truncate text-xs text-muted">{p.name}</span></Link></td>
                    <td className="money py-2.5 text-right font-semibold">{fmtPrice(p.price)}</td>
                    <td className={`py-2.5 text-right font-medium ${toneText(p.changePct)}`}>{fmtPct(p.changePct)}</td>
                    <td className="py-2.5 pl-3 text-right text-xs text-muted">LKR {compact(p.marketCap)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filling && <p className="mt-2 text-xs text-muted">Sector data is still being collected ({data.known} of {data.all} companies), so this list may grow.</p>}
        </>
      )}
    </section>
  );
}
