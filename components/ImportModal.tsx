"use client";
import { useEffect, useRef, useState } from "react";
import { ImportFormatError, parseAtradRows, type ImportPosition } from "@/lib/import/atrad";
import type { Change } from "@/lib/sync";
import { fmtLKR, fmtPrice, shortSymbol } from "@/lib/format";
import { apiPost, revalidateAll } from "@/lib/useApi";

interface Preview {
  plan: Change[];
  unknown: string[];
  today: string;
  minDate: string | null;
  existing: boolean;
}

const KIND_LABEL: Record<Change["kind"], string> = {
  open: "New position", buy: "Buy", sell: "Sell", close: "Sold out", unchanged: "No change", review: "Needs a look",
};
const KIND_STYLE: Record<Change["kind"], string> = {
  open: "bg-brand-soft text-brand", buy: "bg-gain-soft text-gain", sell: "bg-loss-soft text-loss", close: "bg-loss-soft text-loss", unchanged: "bg-subtle text-muted", review: "bg-[#fff4e5] text-warn",
};

export default function ImportModal({ onClose }: { onClose: () => void }) {
  const [positions, setPositions] = useState<ImportPosition[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [fileName, setFileName] = useState("");
  const [asOf, setAsOf] = useState("");
  const [closing, setClosing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setPreview(null);
    setPositions(null);
    setFileName(file.name);
    try {
      const { default: readExcelFile } = await import("read-excel-file/browser"); // loaded only when needed
      const sheets = await readExcelFile(file);
      const rows = (sheets[0]?.data ?? []) as unknown[][];
      const parsed = parseAtradRows(rows);
      setPositions(parsed.positions);
      setWarnings(parsed.warnings);
      const p = await apiPost<Preview>("/api/portfolio/sync", { positions: parsed.positions.map(({ symbol, quantity, totalCost }) => ({ symbol, quantity, totalCost })) });
      setPreview(p);
      setAsOf(p.today);
      setClosing(new Set());
    } catch (e) {
      setError(e instanceof ImportFormatError ? e.message : e instanceof Error && /xlsx|zip|invalid|corrupt|not a valid/i.test(e.message) ? "We couldn't read that file. Please upload the .xlsx portfolio export from ATrad." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const actionable = preview?.plan.filter((c) => c.kind === "open" || c.kind === "buy" || c.kind === "sell" || (c.kind === "close" && closing.has(c.symbol))) ?? [];

  async function apply() {
    if (!positions || !preview) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/portfolio/sync", {
        positions: positions.map(({ symbol, quantity, totalCost }) => ({ symbol, quantity, totalCost })),
        apply: true, asOf, closeSymbols: [...closing],
      });
      revalidateAll();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = "h-10 rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15";
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Import from ATrad" className="card max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-b-none p-5 sm:rounded-b-[20px] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{preview?.existing ? "Sync from ATrad" : "Import your ATrad portfolio"}</h2>
            <p className="mt-1 text-sm text-muted">
              In ATrad, download your Portfolio as Excel, then choose the file here. Prices keep updating on their own. You only need to come back after you buy or sell.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-subtle">✕</button>
        </div>

        <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <button onClick={() => input.current?.click()} disabled={busy} className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-line px-4 py-6 text-center hover:border-brand hover:bg-brand-soft/40 disabled:opacity-60">
          <span className="text-sm font-semibold">{fileName || "Choose your ATrad .xlsx file"}</span>
          <span className="mt-1 text-xs text-muted">{busy && !preview ? "Reading..." : "Your file stays in your browser. Only symbols, quantities and costs are sent."}</span>
        </button>

        {error && <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
        {preview && preview.unknown.length > 0 && <p className="rounded-lg bg-[#fff4e5] px-3 py-2 text-sm text-warn">Not found on the CSE right now, so left out: {preview.unknown.map(shortSymbol).join(", ")}.</p>}
        {warnings.length > 0 && <ul className="space-y-1 rounded-lg bg-[#fff4e5] px-3 py-2 text-sm text-warn">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}

        {preview && (
          <>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-subtle text-xs uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5 text-left font-medium">Stock</th>
                    <th className="px-3 py-2.5 text-right font-medium">Now</th>
                    <th className="px-3 py-2.5 text-right font-medium">ATrad</th>
                    <th className="px-3 py-2.5 text-left font-medium">What happens</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.plan.map((c) => (
                    <tr key={c.symbol} className="border-t border-line align-top">
                      <td className="px-3 py-2.5 font-semibold">{shortSymbol(c.symbol)}</td>
                      <td className="px-3 py-2.5 text-right text-muted">{fmtLKR(c.currentQty)}</td>
                      <td className="px-3 py-2.5 text-right">{fmtLKR(c.targetQty)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[c.kind]}`}>{KIND_LABEL[c.kind]}</span>
                          {c.quantity > 0 && <span className="money">{fmtLKR(c.quantity)} @ {fmtPrice(c.price)}{c.estimated ? " (est.)" : ""}</span>}
                          {c.kind === "close" && (
                            <label className="flex items-center gap-1.5 text-xs">
                              <input type="checkbox" checked={closing.has(c.symbol)} onChange={(e) => setClosing((s) => { const n = new Set(s); if (e.target.checked) n.add(c.symbol); else n.delete(c.symbol); return n; })} /> record as sold
                            </label>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted">{c.note}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="text-xs font-medium text-muted">
                {preview.existing ? "Record these changes on" : "Holdings as of"}
                <input type="date" value={asOf} min={preview.minDate ?? undefined} max={preview.today} onChange={(e) => setAsOf(e.target.value)} className={`${field} mt-1.5 block`} />
              </label>
              <button onClick={apply} disabled={busy || actionable.length === 0 || !asOf} className="h-11 rounded-xl bg-brand px-6 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                {busy ? "Saving..." : actionable.length === 0 ? "Nothing to change" : `Apply ${actionable.length} change${actionable.length === 1 ? "" : "s"}`}
              </button>
            </div>
            {!preview.existing && <p className="text-xs text-muted">ATrad's export doesn't include trade dates, so your holdings start on this date and your value chart begins here. Costs use your ATrad average price, which already includes buying charges.</p>}
          </>
        )}
      </div>
    </div>
  );
}
