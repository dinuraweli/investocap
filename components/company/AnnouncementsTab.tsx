"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GROUP_LABEL, type AnnouncementGroup, type AnnouncementItem } from "@/lib/cse/company";
import { fmtIsoDate, fmtLKR, fmtPrice, sentenceCase } from "@/lib/format";
import { useGeminiKey } from "@/lib/geminiKey";
import { apiPost, useApi } from "@/lib/useApi";
import { useAuth } from "../Providers";
import { ErrorNote, Segmented, Skeleton } from "../ui";

interface ListResponse { total: number; counts: Record<string, number>; matching: number; items: AnnouncementItem[] }
interface Detail {
  id: number; headline: string | null; date: string | null; category: string;
  docs: { name: string; url: string; size: number | null }[];
  dividend: { perShare: number | null; financialYear: string | null; final: boolean | null; exDate: string | null; paymentDate: string | null; recordDate: string | null } | null;
  dealing: { director: string | null; role: string | null; transactions: { type: string; date: string | null; quantity: number | null; price: number | null }[] } | null;
  facts: { label: string; value: string }[];
}
interface Explained { explanation: { summary: string; keyFacts: { label: string; value: string }[] }; model: string; usedDocument: boolean }

const CHIP: Record<AnnouncementGroup, string> = {
  dividends: "bg-gain-soft text-gain", dealings: "bg-brand-soft text-brand", board: "bg-[#fff4e5] text-warn", meetings: "bg-subtle text-muted",
  capital: "bg-[#e8f3fd] text-[#1f6fb2]", disclosures: "bg-subtle text-muted", trading: "bg-loss-soft text-loss", other: "bg-subtle text-muted",
};

function Explain({ symbol, id }: { symbol: string; id: number }) {
  const { user } = useAuth();
  const key = useGeminiKey();
  const cacheKey = `ic_explain:${symbol}:${id}`;
  const [res, setRes] = useState<Explained | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { try { const c = localStorage.getItem(cacheKey); if (c) setRes(JSON.parse(c)); } catch {} }, [cacheKey]);

  async function run() {
    if (!key) return;
    setBusy(true); setError(null);
    try {
      const r = await apiPost<Explained>(`/api/companies/${encodeURIComponent(symbol)}/explain`, { announcementId: id }, { "x-gemini-key": key.key });
      setRes(r);
      try { localStorage.setItem(cacheKey, JSON.stringify(r)); } catch {}
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-3 rounded-xl bg-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Explain this in plain English</span>
        {user && key && !res && <button onClick={run} disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{busy ? "Reading..." : "Explain this"}</button>}
      </div>
      {!user ? <p className="mt-1 text-sm text-muted">Sign in to use this.</p>
        : !key ? <p className="mt-1 text-sm text-muted">Uses your own Gemini key. <Link href={`/reports/${encodeURIComponent(symbol)}`} className="font-medium text-brand hover:underline">Add it on the Reports page</Link>.</p> : null}
      {error && <div className="mt-2"><ErrorNote message={error} /></div>}
      {res && (
        <div className="mt-2 space-y-2">
          <p className="text-sm leading-relaxed">{res.explanation.summary}</p>
          {res.explanation.keyFacts.length > 0 && <dl>{res.explanation.keyFacts.map((f, i) => <div key={i} className="flex justify-between gap-4 border-t border-line py-1.5 text-sm"><dt className="text-muted">{f.label}</dt><dd className="text-right font-medium">{f.value}</dd></div>)}</dl>}
          <p className="text-xs text-muted">AI-generated with {res.model}{res.usedDocument ? " from the attached document" : " from the announcement text only"}. It can make mistakes and is not investment advice.</p>
        </div>
      )}
    </div>
  );
}

function DetailPanel({ symbol, item }: { symbol: string; item: AnnouncementItem }) {
  const { data, error, loading, reload } = useApi<Detail>(`/api/companies/${encodeURIComponent(symbol)}/announcements/${item.id}`);
  if (loading) return <Skeleton className="mt-3 h-24" />;
  if (error || !data) return <div className="mt-3"><ErrorNote message={error?.message ?? "No details available."} onRetry={reload} /></div>;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {data.headline && <p className="font-medium">{data.headline}</p>}
      {data.dividend && (
        <dl className="rounded-xl border border-line p-3">
          {data.dividend.perShare !== null && <div className="flex justify-between py-1"><dt className="text-muted">Dividend per share</dt><dd className="money font-semibold">LKR {fmtPrice(data.dividend.perShare)}{data.dividend.final === null ? "" : data.dividend.final ? " (final)" : " (interim)"}</dd></div>}
          {data.dividend.financialYear && <div className="flex justify-between py-1"><dt className="text-muted">For the year</dt><dd className="font-medium">{data.dividend.financialYear}</dd></div>}
          {([["Ex-dividend date", data.dividend.exDate], ["Record date", data.dividend.recordDate], ["Payment date", data.dividend.paymentDate]] as const).map(([l, v]) => v && <div key={l} className="flex justify-between py-1"><dt className="text-muted">{l}</dt><dd className="font-medium">{fmtIsoDate(v)}</dd></div>)}
        </dl>
      )}
      {data.dealing && (
        <div className="rounded-xl border border-line p-3">
          <p className="font-medium">{data.dealing.director}{data.dealing.role ? <span className="font-normal text-muted"> · {data.dealing.role}</span> : null}</p>
          <ul className="mt-1">{data.dealing.transactions.map((t, i) => <li key={i} className="flex justify-between gap-3 border-t border-line py-1.5 first:border-t-0"><span>{t.type}<span className="text-muted"> · {fmtIsoDate(t.date)}</span></span><span className="money text-right">{t.quantity !== null ? fmtLKR(t.quantity) : "–"} @ {t.price !== null ? fmtPrice(t.price) : "–"}</span></li>)}</ul>
        </div>
      )}
      {data.facts.length > 0 && <dl>{data.facts.map((f) => <div key={f.label} className="flex justify-between py-1"><dt className="text-muted">{f.label}</dt><dd className="font-medium">{/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? fmtIsoDate(f.value) : f.value}</dd></div>)}</dl>}
      {data.docs.length > 0 && <div className="flex flex-wrap gap-2">{data.docs.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand-soft">PDF: {d.name.replace(/\.pdf$/i, "").slice(0, 46)}{d.size ? ` (${Math.max(1, Math.round(d.size / 1024))} KB)` : ""}</a>)}</div>}
      <Explain symbol={symbol} id={item.id} />
    </div>
  );
}

export default function AnnouncementsTab({ symbol }: { symbol: string }) {
  const [group, setGroup] = useState<"all" | AnnouncementGroup>("all");
  const [limit, setLimit] = useState(40);
  const [openId, setOpenId] = useState<number | null>(null);
  const { data, error, loading, reload } = useApi<ListResponse>(`/api/companies/${encodeURIComponent(symbol)}/announcements?limit=${limit}${group === "all" ? "" : `&group=${group}`}`);

  const groups = (Object.keys(GROUP_LABEL) as AnnouncementGroup[]).filter((g) => (data?.counts[g] ?? 0) > 0);
  const labelFor = (g: string) => (g === "all" ? `All (${data?.total ?? "…"})` : `${GROUP_LABEL[g as AnnouncementGroup]} (${data?.counts[g] ?? 0})`);

  return (
    <section className="card overflow-hidden">
      <div className="p-5 pb-3">
        <h2 className="text-[15px] font-semibold">Announcements</h2>
        <p className="mt-0.5 text-sm text-muted">Everything the company has filed with the CSE, newest first. Open one for the details and documents.</p>
        {data && <div className="mt-3"><Segmented options={["all", ...groups].map(labelFor)} value={labelFor(group)} onChange={(l) => { const g = ["all", ...groups].find((x) => labelFor(x) === l)!; setGroup(g as "all" | AnnouncementGroup); setLimit(40); setOpenId(null); }} size="sm" /></div>}
      </div>
      {error ? <div className="p-5 pt-0"><ErrorNote message={error.message} onRetry={reload} /></div>
        : loading && !data ? <div className="space-y-2 p-5 pt-0"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        : data && data.items.length === 0 ? <p className="border-t border-line px-5 py-8 text-center text-sm text-muted">No announcements found.</p>
        : (
          <ul>
            {data?.items.map((a) => (
              <li key={a.id} className="border-t border-line px-5 py-3">
                <button onClick={() => setOpenId(openId === a.id ? null : a.id)} aria-expanded={openId === a.id} className="flex w-full items-center justify-between gap-3 text-left">
                  <span className="min-w-0"><span className="block text-xs text-muted">{fmtIsoDate(a.date)}</span><span className="mt-0.5 block truncate text-sm font-medium">{sentenceCase(a.category)}</span></span>
                  <span className="flex shrink-0 items-center gap-2"><span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${CHIP[a.group]}`}>{GROUP_LABEL[a.group]}</span><span className="text-muted" aria-hidden>{openId === a.id ? "▴" : "▾"}</span></span>
                </button>
                {openId === a.id && <DetailPanel symbol={symbol} item={a} />}
              </li>
            ))}
          </ul>
        )}
      {data && data.matching > data.items.length && <div className="border-t border-line p-4 text-center"><button onClick={() => setLimit((l) => l + 40)} className="rounded-xl border border-line px-5 py-2 text-sm font-semibold hover:bg-subtle">Show more ({data.matching - data.items.length} older)</button></div>}
    </section>
  );
}
