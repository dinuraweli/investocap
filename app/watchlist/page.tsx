"use client";
import { useState } from "react";
import RequireAuth from "@/components/RequireAuth";
import SearchBox from "@/components/SearchBox";
import StockTable from "@/components/StockTable";
import { ErrorNote, Segmented, Skeleton, StaleBanner } from "@/components/ui";
import type { WatchlistsResponse } from "@/lib/api-types";
import { apiDelete, apiPost, revalidateAll, useApi } from "@/lib/useApi";

function Lists() {
  const { data, error, reload } = useApi<WatchlistsResponse>("/api/watchlists", { refreshMs: 15000 });
  const [selected, setSelected] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const lists = data?.watchlists ?? [];
  const current = lists.find((l) => l.id === selected) ?? lists[0];
  const run = async (fn: () => Promise<unknown>) => { setMsg(null); try { await fn(); revalidateAll(); } catch (e) { setMsg((e as Error).message); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Watchlist</h1>
        <SearchBox className="w-full sm:w-72" placeholder="Add a stock to this list" onPick={(symbol) => current && run(() => apiPost(`/api/watchlists/${current.id}/items`, { symbol }))} />
      </div>
      {error && <ErrorNote message={error.message} onRetry={reload} />}
      {msg && <ErrorNote message={msg} />}
      <StaleBanner stale={data?.stale} />
      {!data ? <Skeleton className="h-64" /> : current && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <Segmented options={lists.map((l) => l.name)} value={current.name} onChange={(n) => setSelected(lists.find((l) => l.name === n)?.id ?? null)} />
            <div className="flex gap-2 text-sm font-medium">
              <button onClick={() => { const name = window.prompt("Name for the new watchlist?")?.trim(); if (name) run(async () => { const r = await apiPost<{ id: number }>("/api/watchlists", { name }); setSelected(r.id); }); }} className="rounded-lg px-3 py-2 text-brand hover:bg-brand-soft">New list</button>
              {lists.length > 1 && <button onClick={() => window.confirm(`Delete "${current.name}"?`) && run(async () => { await apiDelete(`/api/watchlists/${current.id}`); setSelected(null); })} className="rounded-lg px-3 py-2 text-loss hover:bg-loss-soft">Delete</button>}
            </div>
          </div>
          <StockTable stocks={current.stocks} empty="This list is empty. Search above to add your first stock." onRemove={(symbol) => run(() => apiDelete(`/api/watchlists/${current.id}/items?symbol=${encodeURIComponent(symbol)}`))} />
        </section>
      )}
    </div>
  );
}

export default function Watchlist() {
  return <RequireAuth><Lists /></RequireAuth>;
}
