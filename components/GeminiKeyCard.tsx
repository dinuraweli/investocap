"use client";
import { useState } from "react";
import { clearKey, saveKey, useGeminiKey } from "@/lib/geminiKey";
import { apiPost } from "@/lib/useApi";

export default function GeminiKeyCard() {
  const stored = useGeminiKey();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (stored === undefined) return null;

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const key = value.trim();
    setBusy(true);
    setError(null);
    try {
      const r = await apiPost<{ model: string }>("/api/reports/key-check", {}, { "x-gemini-key": key });
      saveKey(key, r.model);
      setValue("");
      setEditing(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (stored && !editing) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
        <span><span className="mr-2 text-gain">●</span>Gemini key saved in this browser{stored.model ? <span className="text-muted"> · uses {stored.model}</span> : null}</span>
        <span className="flex gap-1">
          <button onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 font-medium text-brand hover:bg-brand-soft">Change</button>
          <button onClick={clearKey} className="rounded-lg px-3 py-1.5 font-medium text-loss hover:bg-loss-soft">Remove</button>
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={verify} className="card space-y-3 p-5">
      <div>
        <h2 className="text-[15px] font-semibold">Add your Gemini API key</h2>
        <p className="mt-1 text-sm text-muted">
          Reports are read by Google&apos;s Gemini using <em>your own</em> key, so usage is billed to you (Gemini has a free tier). Get a key in{" "}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Google AI Studio</a>.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="password" value={value} onChange={(e) => setValue(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="Paste your key (starts with AIza…)" aria-label="Gemini API key"
          className="h-11 flex-1 rounded-xl border border-line bg-surface px-3.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/15" />
        <button disabled={busy || value.trim().length < 20} className="h-11 rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">{busy ? "Checking..." : "Verify and save"}</button>
        {stored && <button type="button" onClick={() => { setEditing(false); setError(null); }} className="h-11 rounded-xl border border-line px-4 text-sm font-semibold hover:bg-subtle">Cancel</button>}
      </div>
      {error && <p role="alert" className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</p>}
      <p className="text-xs text-muted">Your key is stored only in this browser. It is sent with each analysis request over HTTPS, used once and never saved or logged by InvestoCap. Don&apos;t use a shared computer, and delete the key in AI Studio if you ever lose a device.</p>
    </form>
  );
}
