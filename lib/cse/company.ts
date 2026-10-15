// Company-level data from the CSE (profile, board, announcements) read into clean shapes.
// Pure functions: the raw payloads are what cse.lk returns; nothing here does I/O.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 2000): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s.toLowerCase() !== "none" && s.toLowerCase() !== "null" ? s.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

/** Plain text from the HTML-ish strings CSE returns (line breaks, entities). */
export function stripHtml(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|li)[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

// ---- profile -------------------------------------------------------------------------------------

export interface Person {
  name: string; // "K. Balendra"
  role: string | null; // "Chief Executive Officer/Executive Director"
  title: string | null; // "Chairman" (only for the top posts)
}

export interface CompanyProfile {
  businessSummary: string | null;
  sector: string | null;
  boardType: string | null;
  established: string | null;
  auditors: string | null;
  secretaries: string | null;
  registeredOffice: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  directors: Person[];
  keyPeople: Person[]; // chairman, deputy chairman and similar top posts
}

/** CSE prints a person as firstName "K. (Chief Executive Officer/Executive Director)" and lastName "Balendra". */
export function parsePerson(first: unknown, last: unknown, title?: unknown): Person | null {
  const f = typeof first === "string" ? first.trim() : "";
  const l = typeof last === "string" ? last.trim() : "";
  const m = f.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const initials = (m ? m[1] : f).trim();
  const role = m ? text(m[2], 120) : null;
  const name = [initials, l].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return name ? { name, role, title: text(title, 60) } : null;
}

const dedupePeople = (list: Person[]) => {
  const seen = new Set<string>();
  return list.filter((p) => (seen.has(p.name.toLowerCase()) ? false : (seen.add(p.name.toLowerCase()), true)));
};

export function normaliseProfile(input: unknown): CompanyProfile {
  const raw: Record<string, unknown> = isObj(input) ? input : {}; // some companies have no profile yet: return an empty one rather than failing the page
  const sum = Array.isArray(raw.reqComSumInfo) && isObj(raw.reqComSumInfo[0]) ? raw.reqComSumInfo[0] : {};
  const biz = Array.isArray(raw.infoCompanyBusinessSummary) && isObj(raw.infoCompanyBusinessSummary[0]) ? text(stripHtml(String(raw.infoCompanyBusinessSummary[0].body ?? "")), 3000) : null;
  const people = (v: unknown, withTitle: boolean) =>
    (Array.isArray(v) ? v : []).flatMap((p) => (isObj(p) ? [parsePerson(p.firstName, p.lastName, withTitle ? p.designationOther : null)] : [])).filter((p): p is Person => !!p);
  const keyPeople = dedupePeople(people(raw.topPosts, true));
  const keyNames = new Set(keyPeople.map((p) => p.name.toLowerCase()));
  return {
    businessSummary: biz,
    sector: text(sum.sector, 80),
    boardType: text(sum.boardType, 60),
    established: text(sum.established, 20),
    auditors: text(sum.auditors, 200)?.replace(/,\s*$/, "") ?? null,
    secretaries: text(sum.secretaries, 200),
    registeredOffice: text(sum.registeredOffice, 300) ?? text(sum.registerOffice, 300),
    phone: text(sum.tel1, 60),
    fax: text(sum.fax, 60),
    email: text(sum.email1, 120),
    website: text(sum.web, 160),
    keyPeople,
    directors: dedupePeople(people(raw.infoCompanyDirector, false)).filter((p) => !keyNames.has(p.name.toLowerCase())),
  };
}

// ---- announcements -------------------------------------------------------------------------------

export type AnnouncementGroup = "dividends" | "dealings" | "board" | "meetings" | "capital" | "disclosures" | "trading" | "other";

export const GROUP_LABEL: Record<AnnouncementGroup, string> = {
  dividends: "Dividends", dealings: "Directors' dealings", board: "Board changes", meetings: "Meetings & circulars", capital: "Share capital", disclosures: "Disclosures", trading: "Trading & compliance", other: "Other",
};

/** Bucket a CSE announcement category into a small set a reader can filter by. Order matters. */
export function groupOf(category: string): AnnouncementGroup {
  const c = category.toLowerCase();
  if (/dividend/.test(c)) return "dividends";
  if (/dealings? by director/.test(c)) return "dealings";
  if (/trading (halt|suspen)|watch list|non-?compliance|buy-?in/.test(c)) return "trading";
  if (/appointment|resignation|retirement|directorate|change of (chief|registered)/.test(c)) return "board";
  if (/general meeting|\bagm\b|\begm\b|circular/.test(c)) return "meetings";
  if (/rights|issue of shares|sub-?\s?division|esos|employee share option|repurchase|warrants?|debenture|listing of shares|private placement|share issue|conversion/.test(c)) return "capital";
  if (/disclosure|announcement|clarification|rating|related party/.test(c)) return "disclosures";
  return "other";
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** "13 Aug 2026" -> "2026-08-13". null if it is not in that form. */
export function parseCseDate(s: unknown): string | null {
  const m = typeof s === "string" ? s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/) : null;
  const mm = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && mm ? `${m[3]}-${mm}-${m[1].padStart(2, "0")}` : null;
}

const msToDate = (v: unknown): string | null => {
  const n = num(v);
  return n === null ? null : new Date(n).toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });
};

export interface AnnouncementItem {
  id: number;
  category: string;
  group: AnnouncementGroup;
  date: string | null; // YYYY-MM-DD
}

/** Company announcement list, newest first. Rows without an id or category are skipped. */
export function normaliseAnnouncementList(raw: unknown): AnnouncementItem[] {
  const rows = isObj(raw) && Array.isArray(raw.reqCompanyAnnouncement) ? raw.reqCompanyAnnouncement : [];
  const seen = new Set<number>();
  const out: (AnnouncementItem & { created: number })[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const id = num(r.announcementId);
    const category = text(r.announcementCategory, 200);
    if (id === null || !category || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, category, group: groupOf(category), date: parseCseDate(r.dateOfAnnouncement), created: num(r.createdDate) ?? 0 });
  }
  return out.sort((a, b) => ((b.date ?? "") < (a.date ?? "") ? -1 : (b.date ?? "") > (a.date ?? "") ? 1 : b.created - a.created || b.id - a.id)).map(({ created: _c, ...x }) => x);
}

export interface AnnouncementDoc { name: string; path: string; size: number | null }

export interface AnnouncementDetail {
  id: number;
  headline: string | null;
  date: string | null;
  docs: AnnouncementDoc[];
  dividend: { perShare: number | null; financialYear: string | null; final: boolean | null; exDate: string | null; paymentDate: string | null; recordDate: string | null } | null;
  dealing: { director: string | null; role: string | null; transactions: { type: string; date: string | null; quantity: number | null; price: number | null }[] } | null;
  facts: { label: string; value: string }[]; // other dates and terms worth showing
}

const DOC_PATH_RE = /^cmt\/announcement_portal_prod\/[^\\/]+\.pdf$/i;
/** Only announcement PDFs from the CSE's own document folder are ever downloaded or linked. */
export const isAnnouncementDocPath = (p: string) => DOC_PATH_RE.test(p);

const FACT_FIELDS: [string, string][] = [
  ["agmDate", "Meeting date"], ["dateOfAgm", "Meeting date"], ["recordDate", "Record date"], ["allotment", "Allotment"], ["xr", "Ex-rights date"], ["xc", "Ex-capitalisation date"],
  ["tradingCommencement", "Trading commences"], ["tradingSuspended", "Trading suspended"], ["effectiveDate", "Effective date"],
];

/** Detail for one announcement. Accepts the payload of getAnnouncementById or getGeneralAnnouncementById; null if it is empty. */
export function normaliseAnnouncementDetail(raw: unknown): AnnouncementDetail | null {
  if (!isObj(raw) || !isObj(raw.reqBaseAnnouncement)) return null;
  const b = raw.reqBaseAnnouncement;
  const id = num(b.id);
  if (id === null) return null;

  const docs: AnnouncementDoc[] = (Array.isArray(raw.reqAnnouncementDocs) ? raw.reqAnnouncementDocs : [])
    .flatMap((d) => (isObj(d) && typeof d.fileUrl === "string" && isAnnouncementDocPath(d.fileUrl) ? [{ name: text(d.fileOriginalName ?? d.fileName, 200) ?? "Document", path: d.fileUrl, size: num(d.fileSize) }] : []));

  const isDividend = typeof b.dType === "string" && /dividend/i.test(b.dType);
  const dividend = isDividend
    ? { perShare: num(b.votingDivPerShare) ?? num(b.nonVotingDivPerShare) ?? num(b.divPerShare), financialYear: text(b.financialYear, 20), final: typeof b.finalDividend === "boolean" ? b.finalDividend : null, exDate: parseCseDate(b.xd), paymentDate: parseCseDate(b.payment), recordDate: msToDate(b.recordDate) }
    : null;

  const txs = Array.isArray(b.directorTransactions) ? b.directorTransactions : [];
  const dealing = txs.length > 0 || b.dircetorsName
    ? {
        director: text(b.dircetorsName, 120), role: text(b.natureOfDir, 80),
        transactions: txs.flatMap((t) => (isObj(t) && text(t.transType, 80) ? [{ type: text(t.transType, 80)!, date: parseCseDate(t.transactionDate), quantity: num(t.quantity), price: num(t.price) }] : [])),
      }
    : null;

  const facts: { label: string; value: string }[] = [];
  const seenLabels = new Set<string>();
  for (const [key, label] of FACT_FIELDS) {
    const v = b[key];
    const val = key === "recordDate" ? (dividend ? null : msToDate(v)) : typeof v === "number" ? msToDate(v) : parseCseDate(v) ?? text(v, 120);
    if (val && !seenLabels.has(label)) { seenLabels.add(label); facts.push({ label, value: val }); }
  }

  return { id, headline: text(b.remarks, 400) ?? text(b.title, 200), date: parseCseDate(b.dateOfAnnouncement), docs, dividend, dealing, facts };
}
