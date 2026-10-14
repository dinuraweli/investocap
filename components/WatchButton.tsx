"use client";
import { useEffect, useRef, useState } from "react";
import type { WatchlistsResponse } from "@/lib/api-types";
import { apiDelete, apiPost, revalidateAll, useApi } from "@/lib/useApi";
import { useAuth } from "./Providers";

/** Star button that adds/removes a stock from the user's watchlists. */
export default function WatchButton({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const lists = useApi<WatchlistsResponse>(user ? "/api/watchlists" : null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const all = lists.data?.watchlists ?? [];
  const inAny = all.some((w) => w.stocks.some((s) => s.symbol === symbol));

  async function toggle(id: number, has: boolean) {
    setBusy(true);
    try {
      if (has) await apiDelete(`/api/watchlists/${id}/items?symbol=${encodeURIComponent(symbol)}`);
      else await apiPost(`/api/watchlists/${id}/items`, { symbol });
      revalidateAll();
    } finally { setBusy(false); }
  }

  const onClick = () => {
    if (!user) return (window.location.href = "/");
    if (all.length === 1) toggle(all[0].id, inAny);
    else setOpen((o) => !o);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={onClick} disabled={busy} aria-pressed={inAny} className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold ${inAny ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface hover:bg-subtle"}`}>
        <span aria-hidden>{inAny ? "★" : "☆"}</span> {inAny ? "Watching" : "Watch"}
      </button>
      {open && all.length > 1 && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-line bg-surface p-1 shadow-lg">
          {all.map((w) => {
            const has = w.stocks.some((s) => s.symbol === symbol);
            return <button key={w.id} onClick={() => toggle(w.id, has)} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-subtle"><span className="truncate">{w.name}</span><span className="text-brand">{has ? "✓" : ""}</span></button>;
          })}
        </div>
      )}
    </div>
  );
}
