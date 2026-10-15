"use client";
import { useEffect, useState } from "react";
import type { CompanyProfile, Person } from "@/lib/cse/company";
import { compact, fmtIsoDate, fmtLKR, fmtPrice } from "@/lib/format";
import { useGeminiKey } from "@/lib/geminiKey";
import { apiPost, useApi } from "@/lib/useApi";
import { useAuth } from "../Providers";
import { ErrorNote, Skeleton } from "../ui";
import Link from "next/link";

interface CompanyResponse {
  name: string;
  appSector: string;
  profile: CompanyProfile | null;
  structure: { sharesIssued: number | null; marketCap: number; marketCapPct: number | null; isin: string | null; listedOn: string | null; beta: number | null; allTimeHigh: number | null; allTimeLow: number | null } | null;
}
interface Brief { brief: string; points: string[]; model: string; usedResults: boolean; generatedAt: string }

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between gap-4 border-b border-line py-2.5 text-sm"><dt className="shrink-0 text-muted">{label}</dt><dd className="text-right font-medium">{value}</dd></div>
);

/** Executive, independent and other directors, in that order. */
function groupDirectors(list: Person[]) {
  const kind = (p: Person) => (/executive director/i.test(p.role ?? "") && !/non-?executive|non executive/i.test(p.role ?? "") ? 0 : /independent/i.test(p.role ?? "") && !/non independent/i.test(p.role ?? "") ? 1 : 2);
  const groups: [string, Person[]][] = [["Executive directors", []], ["Independent directors", []], ["Other non-executive directors", []]];
  for (const p of list) groups[kind(p)][1].push(p);
  return groups.filter(([, ps]) => ps.length > 0);
}

function BriefCard({ symbol }: { symbol: string }) {
  const { user } = useAuth();
  const key = useGeminiKey();
  const cacheKey = `ic_brief:${symbol}`;
  const [brief, setBrief] = useState<Brief | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { try { const c = localStorage.getItem(cacheKey); if (c) setBrief(JSON.parse(c)); } catch {} }, [cacheKey]);

  async function write() {
    if (!key) return;
    setBusy(true); setError(null);
    try {
      const b = await apiPost<Brief>(`/api/companies/${encodeURIComponent(symbol)}/brief`, {}, { "x-gemini-key": key.key });
      setBrief(b);
      try { localStorage.setItem(cacheKey, JSON.stringify(b)); } catch {}
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h2 className="text-[15px] font-semibold">Short company brief</h2><p className="mt-0.5 text-sm text-muted">A plain-English summary written by AI from the CSE profile, recent announcements and your latest analysed results.</p></div>
        {user && key && <button onClick={write} disabled={busy} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold hover:bg-subtle disabled:opacity-60">{busy ? "Writing..." : brief ? "Write again" : "Write a brief"}</button>}
      </div>
      {!user ? <p className="mt-3 text-sm text-muted">Sign in to use this.</p>
        : !key ? <p className="mt-3 text-sm text-muted">Uses your own Gemini key. <Link href={`/reports/${encodeURIComponent(symbol)}`} className="font-medium text-brand hover:underline">Add it on the Reports page</Link>, then come back.</p> : null}
      {error && <div className="mt-3"><ErrorNote message={error} /></div>}
      {brief && (
        <div className="mt-3 space-y-2">
          <p className="text-[15px] leading-relaxed">{brief.brief}</p>
          {brief.points.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{brief.points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          <p className="text-xs text-muted">AI-generated on {fmtIsoDate(brief.generatedAt.slice(0, 10))} with {brief.model}{brief.usedResults ? " using your analysed results" : ""}. It can make mistakes and is not investment advice.</p>
        </div>
      )}
    </section>
  );
}

export default function AboutTab({ symbol }: { symbol: string }) {
  const { data, error, loading, reload } = useApi<CompanyResponse>(`/api/companies/${encodeURIComponent(symbol)}`);
  if (loading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (error || !data) return <ErrorNote message={error?.message ?? "Company details aren't available right now."} onRetry={reload} />;
  const p = data.profile, s = data.structure;

  return (
    <div className="space-y-4">
      <BriefCard symbol={symbol} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="text-[15px] font-semibold">About the company</h2>
          {p?.businessSummary ? <p className="mt-2 text-sm leading-relaxed text-muted">{p.businessSummary}</p> : <p className="mt-2 text-sm text-muted">The CSE has no business summary for this company.</p>}
          <dl className="mt-3">
            <Row label="Sector" value={p?.sector ?? data.appSector} />
            {p?.boardType && <Row label="Board" value={p.boardType} />}
            {p?.established && <Row label="Established" value={p.established} />}
            {s?.listedOn && <Row label="Listed on the CSE" value={s.listedOn.replace(/\//g, " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())} />}
            {p?.auditors && <Row label="Auditors" value={p.auditors} />}
            {p?.secretaries && <Row label="Company secretaries" value={p.secretaries} />}
            {p?.registeredOffice && <Row label="Registered office" value={p.registeredOffice} />}
            {p?.phone && <Row label="Phone" value={p.phone} />}
            {p?.email && <Row label="Email" value={<a className="text-brand hover:underline" href={`mailto:${p.email}`}>{p.email}</a>} />}
            {p?.website && <Row label="Website" value={<a className="text-brand hover:underline" target="_blank" rel="noreferrer" href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`}>{p.website}</a>} />}
          </dl>
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Share structure</h2>
            {s ? (
              <dl className="mt-2">
                <Row label="Shares issued" value={s.sharesIssued ? `${fmtLKR(s.sharesIssued)} (${compact(s.sharesIssued)})` : "–"} />
                <Row label="Market value" value={`LKR ${compact(s.marketCap)}`} />
                {s.marketCapPct !== null && <Row label="Share of the whole market" value={`${s.marketCapPct.toFixed(2)}%`} />}
                {s.beta !== null && <Row label="Beta (vs S&P SL20)" value={s.beta.toFixed(2)} />}
                {s.allTimeHigh !== null && <Row label="All-time high / low" value={`${fmtPrice(s.allTimeHigh)} / ${s.allTimeLow !== null ? fmtPrice(s.allTimeLow) : "–"}`} />}
                {s.isin && <Row label="ISIN" value={s.isin} />}
              </dl>
            ) : <p className="mt-2 text-sm text-muted">Share details aren&apos;t available right now.</p>}
            <p className="mt-3 text-xs text-muted">The CSE does not publish a shareholder list through this feed. Top shareholders are in the company&apos;s annual report.</p>
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-semibold">Board and management</h2>
            {!p || (p.keyPeople.length === 0 && p.directors.length === 0) ? <p className="mt-2 text-sm text-muted">The CSE has no board details for this company.</p> : (
              <div className="mt-2 space-y-4">
                {p.keyPeople.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Leadership</h3>
                    <ul className="mt-1">{p.keyPeople.map((k) => <li key={k.name} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm"><span className="font-medium">{k.name}</span><span className="text-right text-muted">{[k.title, k.role].filter(Boolean).join(" · ")}</span></li>)}</ul>
                  </div>
                )}
                {groupDirectors(p.directors).map(([title, people]) => (
                  <div key={title}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
                    <ul className="mt-1">{people.map((d) => <li key={d.name} className="flex justify-between gap-4 border-b border-line py-2.5 text-sm"><span className="font-medium">{d.name}</span><span className="text-right text-muted">{d.role ?? ""}</span></li>)}</ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
