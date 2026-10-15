import { test } from "node:test";
import assert from "node:assert/strict";
import { groupOf, isAnnouncementDocPath, normaliseAnnouncementDetail, normaliseAnnouncementList, normaliseProfile, parseCseDate, parsePerson, stripHtml } from "../lib/cse/company.ts";

// Fixtures follow the real cse.lk payload shapes, with invented company details.
const PROFILE = {
  reqComSumInfo: [{ name: "EXAMPLE HOLDINGS PLC", symbol: "EXH", registerOffice: "1 Main St, Colombo 01.", registeredOffice: "1 Main St, Colombo 01.", tel1: "011- 2345678", fax: "011-2000000", email1: "info@example.lk", web: "www.example.lk", established: "1979", sector: "Capital Goods", boardType: "Main Board", auditors: "Messrs. Alpha & Co,", secretaries: "Example Secretaries (Pvt) Ltd.", capital: "None" }],
  infoCompanyBusinessSummary: [{ title: " ", body: "Retail, leisure &amp; property.<br>Operates islandwide." }],
  topPosts: [{ directorId: 1, firstName: "K. (Chief Executive Officer/Executive Director)", lastName: "Silva", designationOther: "Chairman " }],
  infoCompanyDirector: [
    { firstName: "K. (Chief Executive Officer/Executive Director)", lastName: "Silva" }, // same person as the chairman: not listed twice
    { firstName: "A.(Non Independent Non-Executive Director) ", lastName: "Perera" },
    { firstName: "S. A. (Independent Non-Executive Director)", lastName: "Fernando" },
    { firstName: "Prof. M.", lastName: "Jayasinghe" }, // no role in brackets
    { firstName: "", lastName: "" }, // junk row
  ],
};

test("reads the profile: contacts, sector, board and a clean business summary", () => {
  const p = normaliseProfile(PROFILE);
  assert.equal(p.sector, "Capital Goods");
  assert.equal(p.boardType, "Main Board");
  assert.equal(p.website, "www.example.lk");
  assert.equal(p.auditors, "Messrs. Alpha & Co"); // trailing comma dropped
  assert.equal(p.businessSummary, "Retail, leisure & property. Operates islandwide."); // tidied to a single paragraph
  assert.equal(p.phone, "011- 2345678");
});

test("people: roles come from the brackets, the chairman is not repeated among directors", () => {
  const p = normaliseProfile(PROFILE);
  assert.deepEqual(p.keyPeople, [{ name: "K. Silva", role: "Chief Executive Officer/Executive Director", title: "Chairman" }]);
  assert.deepEqual(p.directors.map((d) => [d.name, d.role]), [["A. Perera", "Non Independent Non-Executive Director"], ["S. A. Fernando", "Independent Non-Executive Director"], ["Prof. M. Jayasinghe", null]]);
  assert.equal(parsePerson("", ""), null);
});

test("an empty or missing profile payload gives an empty profile, not an error", () => {
  for (const raw of [null, undefined, {}, "junk"]) {
    const p = normaliseProfile(raw);
    assert.equal(p.sector, null);
    assert.deepEqual(p.directors, []);
  }
});

test("dates: 'DD Mon YYYY' to ISO, anything else to null", () => {
  assert.equal(parseCseDate("13 Aug 2026"), "2026-08-13");
  assert.equal(parseCseDate("5 Jan 2024"), "2024-01-05");
  assert.equal(parseCseDate("31 Sept 2025"), "2025-09-31"); // month word matched on its first 3 letters
  assert.equal(parseCseDate("2026-08-13"), null);
  assert.equal(parseCseDate(null), null);
});

test("announcement categories fall into sensible filter groups", () => {
  const g = groupOf;
  assert.equal(g("CASH DIVIDEND"), "dividends");
  assert.equal(g("DIVIDEND ANNOUNCEMENT (ON THE ENHANCED CAPITAL POST THE RIGHTS ISSUE)"), "dividends");
  assert.equal(g("DEALINGS BY DIRECTORS"), "dealings");
  assert.equal(g("DEALINGS BY DIRECTORS (EMPLOYEE SHARE OPTION SCHEME)"), "dealings");
  assert.equal(g("RESIGNATION OF DIRECTORS"), "board");
  assert.equal(g("CHANGE IN DIRECTORATE"), "board");
  assert.equal(g("APPOINTMENT OF CHIEF EXECUTIVE OFFICER"), "board");
  assert.equal(g("ANNUAL GENERAL MEETING - APPROVED"), "meetings");
  assert.equal(g("EXTRAORDINARY GENERAL MEETING (RIGHTS / WARRANTS ISSUE)"), "meetings");
  assert.equal(g("CIRCULAR TO SHAREHOLDERS"), "meetings");
  assert.equal(g("RIGHTS ISSUE (DATES)"), "capital");
  assert.equal(g("EMPLOYEE SHARE OPTION SCHEME"), "capital");
  assert.equal(g("REPURCHASE OF SHARES (NOTIFICATION ON REPURCHASE OF SHARES)"), "capital");
  assert.equal(g("SUB-DIVISION OF SHARES (DATES)"), "capital");
  assert.equal(g("DEBENTURE ISSUE"), "capital");
  assert.equal(g("CORPORATE DISCLOSURE"), "disclosures");
  assert.equal(g("RATING REVIEW"), "disclosures");
  assert.equal(g("Trading Halted"), "trading");
  assert.equal(g("NON-COMPLIANCE OF CORPORATE GOVERNANCE RULES"), "trading");
  assert.equal(g("WATCH LIST - TRANSFERRED IN"), "trading");
  assert.equal(g("SOMETHING NEW"), "other");
});

test("announcement list: newest first, duplicates and incomplete rows dropped", () => {
  const row = (id: number | null, cat: string | null, date: string, created = 0) => ({ announcementId: id, announcementCategory: cat, dateOfAnnouncement: date, createdDate: created });
  const list = normaliseAnnouncementList({ reqCompanyAnnouncement: [row(1, "CASH DIVIDEND", "26 May 2026"), row(2, "CORPORATE DISCLOSURE", "13 Aug 2026"), row(2, "CORPORATE DISCLOSURE", "13 Aug 2026"), row(3, "DEALINGS BY DIRECTORS", "13 Aug 2026", 5), row(null, "X", "1 Jan 2026"), row(4, null, "1 Jan 2026"), "junk"] });
  assert.deepEqual(list.map((a) => [a.id, a.group, a.date]), [[3, "dealings", "2026-08-13"], [2, "disclosures", "2026-08-13"], [1, "dividends", "2026-05-26"]]);
  assert.deepEqual(normaliseAnnouncementList(null), []);
});

test("dividend detail: per-share amount, year, and the key dates", () => {
  const d = normaliseAnnouncementDetail({
    reqBaseAnnouncement: { id: 10, dType: "CashDividendWithDates", dateOfAnnouncement: "26 May 2026", remarks: "Final Dividend (Rs.0.10 per share) for the year ended 31 March 2026", votingDivPerShare: 0.1, finalDividend: true, financialYear: "2025/26", xd: "05 Jun 2026", payment: "24 Jun 2026", recordDate: Date.UTC(2026, 5, 8, 18, 30) },
    reqAnnouncementDocs: [{ fileOriginalName: "Letter.pdf", fileUrl: "cmt/announcement_portal_prod/JKH FINAL DIVIDEND LETTER_266.pdf", fileSize: 266552 }],
  })!;
  assert.equal(d.headline, "Final Dividend (Rs.0.10 per share) for the year ended 31 March 2026");
  assert.deepEqual(d.dividend, { perShare: 0.1, financialYear: "2025/26", final: true, exDate: "2026-06-05", paymentDate: "2026-06-24", recordDate: "2026-06-09" });
  assert.equal(d.docs[0].name, "Letter.pdf");
  assert.equal(d.dealing, null);
});

test("directors' dealings detail lists each transaction", () => {
  const d = normaliseAnnouncementDetail({
    reqBaseAnnouncement: { id: 11, dType: "DealingsByDirectors", dateOfAnnouncement: "13 Aug 2026", remarks: "DEALINGS BY DIRECTOR", dircetorsName: "Mr. A B Silva", natureOfDir: "Executive Director",
      directorTransactions: [{ transType: "Purchase of Shares", transactionDate: "12 Aug 2026", quantity: 1127659.0, price: 12.17 }, { transType: "Purchase of Shares", transactionDate: "12 Aug 2026", quantity: 902127, price: 14.53 }, { transType: "" }] },
  })!;
  assert.equal(d.dealing!.director, "Mr. A B Silva");
  assert.equal(d.dealing!.role, "Executive Director");
  assert.deepEqual(d.dealing!.transactions, [{ type: "Purchase of Shares", date: "2026-08-12", quantity: 1127659, price: 12.17 }, { type: "Purchase of Shares", date: "2026-08-12", quantity: 902127, price: 14.53 }]);
  assert.equal(d.dividend, null);
});

test("general announcements use the title as a fallback headline and surface useful dates", () => {
  const d = normaliseAnnouncementDetail({ reqBaseAnnouncement: { id: 12, title: "CORPORATE DISCLOSURE", dateOfAnnouncement: "30 Jun 2026", agmDate: "26 Jul 2026", recordDate: null } })!;
  assert.equal(d.headline, "CORPORATE DISCLOSURE");
  assert.deepEqual(d.facts, [{ label: "Meeting date", value: "2026-07-26" }]); // dates are ISO; the page formats them
});

test("empty detail payloads (the wrong endpoint answers {}) are rejected", () => {
  for (const raw of [{}, null, { reqBaseAnnouncement: {} }, { reqBaseAnnouncement: { id: "x" } }]) assert.equal(normaliseAnnouncementDetail(raw), null);
});

test("only the CSE's announcement document folder is accepted for downloads (no traversal or other hosts)", () => {
  assert.ok(isAnnouncementDocPath("cmt/announcement_portal_prod/JKH AGM (1)_5324.pdf"));
  for (const bad of ["cmt/announcement_portal_prod/../secret.pdf", "cmt/announcement_portal_prod/a/b.pdf", "https://evil.com/a.pdf", "cmt/upload_report_file/a.pdf", "cmt/announcement_portal_prod/a.exe", ""]) assert.ok(!isAnnouncementDocPath(bad), bad);
  const d = normaliseAnnouncementDetail({ reqBaseAnnouncement: { id: 13, remarks: "x" }, reqAnnouncementDocs: [{ fileUrl: "../../etc/passwd" }, { fileUrl: "cmt/announcement_portal_prod/ok.pdf", fileOriginalName: "ok.pdf" }] })!;
  assert.deepEqual(d.docs.map((x) => x.name), ["ok.pdf"]);
});

test("html is reduced to readable text", () => {
  assert.equal(stripHtml("A&nbsp;&amp; B<br/>C<p>D</p>"), "A & B\nC\nD");
});
