"use client";
import { useEffect, useRef, useState } from "react";
import type { StocksResponse } from "@/lib/api-types";
import { fmtPct, fmtPrice, shortSymbol, toneText } from "@/lib/format";

/** Typeahead over the live quote list. `onPick` receives the full symbol. */
export default function SearchBox({ onPick, placeholder = "Search stocks", autoFocus, className = "" }: { onPick: (symbol: string) => void; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<StocksResponse["stocks"]>([]);
  const [active, setActive] = useState(0);
  const [loadedFor, setLoadedFor] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.trim()) { setRows([]); return; }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/stocks?q=${encodeURIComponent(q)}&limit=8`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: StocksResponse) => { setRows(d.stocks ?? []); setActive(0); setLoadedFor(q); })
        .catch(() => {});
    }, 150);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (s: string) => { setQ(""); setOpen(false); onPick(s); };

  return (
    <div ref={box} className={`relative ${className}`}>
      <input
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter" && rows[active]) { e.preventDefault(); pick(rows[active].symbol); }
          else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-full rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
      />
      {open && q.trim() && (
        <ul className="absolute left-0 right-0 z-30 mt-1.5 max-h-80 overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg sm:min-w-80">
          {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted">{loadedFor === q ? "No matches" : "Searching..."}</li>}
          {rows.map((s, i) => (
            <li key={s.symbol}>
              <button onMouseEnter={() => setActive(i)} onClick={() => pick(s.symbol)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-subtle" : ""}`}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{shortSymbol(s.symbol)}</span>
                  <span className="block truncate text-xs text-muted">{s.name}</span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span className="money block font-semibold">{fmtPrice(s.price)}</span>
                  <span className={`block text-xs font-medium ${toneText(s.changePct)}`}>{fmtPct(s.changePct)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
