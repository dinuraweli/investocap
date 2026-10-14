"use client";
import { useEffect, useState } from "react";
import type { StockResponse } from "@/lib/api-types";
import { fmtPrice, shortSymbol } from "@/lib/format";
import { apiPost, revalidateAll } from "@/lib/useApi";
import SearchBox from "./SearchBox";
import type { TradeOpts } from "./Providers";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

export default function TradeModal({ initial, onClose }: { initial: TradeOpts; onClose: () => void }) {
  const [symbol, setSymbol] = useState<string | null>(initial.symbol ?? null);
  const [name, setName] = useState("");
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [side, setSide] = useState<"buy" | "sell">(initial.side ?? "buy");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;
    fetch(`/api/stocks/${encodeURIComponent(symbol)}`).then((r) => r.json()).then((d: StockResponse) => {
      if (!d.quote) return;
      setName(d.quote.name);
      setLivePrice(d.quote.price);
      setPrice((p) => p || String(d.quote.price));
    });
  }, [symbol]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!symbol) return setError("Choose a stock first");
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/portfolio/transactions", { symbol, side, quantity: Number(qty), price: Number(price), fees: fees ? Number(fees) : 0, tradedOn: date });
      revalidateAll();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const total = Number(qty) * Number(price) + (side === "buy" ? 1 : -1) * Number(fees || 0);
  const field = "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  const label = "mb-1.5 block text-xs font-medium text-muted";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="New trade" className="card max-h-[92vh] w-full max-w-md space-y-4 overflow-y-auto rounded-b-none p-5 sm:rounded-b-[20px] sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">New trade</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-subtle">✕</button>
        </div>

        <div className="inline-flex w-full rounded-xl bg-subtle p-1">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize ${side === s ? (s === "buy" ? "bg-gain text-white" : "bg-loss text-white") : "text-muted"}`}>{s}</button>
          ))}
        </div>

        <div>
          <span className={label}>Stock</span>
          {symbol ? (
            <div className="flex items-center justify-between rounded-xl border border-line px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{shortSymbol(symbol)}</div>
                <div className="truncate text-xs text-muted">{name}</div>
              </div>
              <div className="flex items-center gap-3">
                {livePrice !== null && <span className="money text-sm font-semibold">{fmtPrice(livePrice)}</span>}
                <button type="button" onClick={() => { setSymbol(null); setPrice(""); setLivePrice(null); }} className="text-sm font-medium text-brand">Change</button>
              </div>
            </div>
          ) : (
            <SearchBox autoFocus placeholder="Search by name or symbol" onPick={setSymbol} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={label} htmlFor="qty">Shares</label><input id="qty" className={field} inputMode="decimal" type="number" min="0" step="any" required value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <div><label className={label} htmlFor="px">Price (LKR)</label><input id="px" className={field} inputMode="decimal" type="number" min="0" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          <div><label className={label} htmlFor="fees">Fees (LKR)</label><input id="fees" className={field} inputMode="decimal" type="number" min="0" step="any" placeholder="0" value={fees} onChange={(e) => setFees(e.target.value)} /></div>
          <div><label className={label} htmlFor="date">Date</label><input id="date" className={field} type="date" required max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
        </div>

        {Number.isFinite(total) && total > 0 && (
          <div className="flex justify-between rounded-xl bg-subtle px-3.5 py-2.5 text-sm">
            <span className="text-muted">{side === "buy" ? "Total cost" : "Net proceeds"}</span>
            <span className="money font-semibold">LKR {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        )}
        {error && <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
        <button disabled={busy} className="h-11 w-full rounded-xl bg-brand text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{busy ? "Saving..." : `Record ${side}`}</button>
        <p className="text-center text-xs text-muted">This records a trade you made elsewhere. InvestoCap does not place orders.</p>
      </form>
    </div>
  );
}
