// Parses the UTASL unit-prices table (https://www.utasl.lk/unit-prices/) into fund rows.
// The page is a plain server-rendered HTML table: Company | Fund Name | Selling Price | Buying Price.
// "Selling Price" is what the manager buys units back at (redemption, ~NAV); "Buying Price" is the offer.
// We value holdings at the selling price. Pure (no I/O) so it is easy to test.

export type FundType = "Money Market" | "Income" | "Gilt" | "Equity" | "Balanced" | "Index" | "Shariah" | "Other";

export interface Fund {
  slug: string; // stable id derived from the fund name
  name: string;
  manager: string;
  sell: number; // selling price (redemption), LKR per unit
  buy: number; // buying price (offer), LKR per unit
  type: FundType;
}

export class FundParseError extends Error {}

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#038;": "&", "&nbsp;": " ", "&#8220;": '"', "&#8221;": '"', "&#8217;": "'" };
const decode = (s: string) => s.replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? m);
const clean = (cell: string) => decode(cell.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
const price = (s: string): number | null => {
  const m = s.replace(/,/g, "").match(/\d+(?:\.\d+)?/); // first number; ignores "Rs.", "n/a", "-"
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Guess a fund category from its name, for filtering. */
export function fundType(name: string): FundType {
  const n = name.toLowerCase();
  if (/shari'?ah|islamic/.test(n)) return "Shariah";
  if (/\bindex\b/.test(n)) return "Index";
  if (/money market|cash|liquid/.test(n)) return "Money Market";
  if (/gilt|government|treasury|g-?sec|sovereign/.test(n)) return "Gilt";
  if (/balanced|allocation|multi.?asset/.test(n)) return "Balanced";
  if (/equity|growth|value fund|dynamic/.test(n)) return "Equity";
  if (/income|fixed income|bond|dividend|yield/.test(n)) return "Income";
  return "Other";
}

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

/** Parse the unit-prices page HTML into funds. Throws FundParseError if the table is missing or empty. */
export function parseUnitPrices(html: string): Fund[] {
  const table = /<table[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) throw new FundParseError("UTASL: no unit-prices table found (page layout may have changed).");

  const funds: Fund[] = [];
  const slugs = new Set<string>();
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => clean(m[1]));
    if (cells.length < 4) continue;
    const [manager, name] = cells;
    const sell = price(cells[2]);
    const buy = price(cells[3]);
    if (!manager || !name || sell === null || buy === null) continue; // header row or malformed
    if (/^(company|fund)/i.test(manager)) continue;
    let slug = slugify(name);
    if (!slug) continue;
    if (slugs.has(slug)) { let i = 2; while (slugs.has(`${slug}-${i}`)) i++; slug = `${slug}-${i}`; }
    slugs.add(slug);
    funds.push({ slug, name, manager, sell, buy, type: fundType(name) });
  }
  if (funds.length === 0) throw new FundParseError("UTASL: the unit-prices table was empty (no fund rows).");
  return funds;
}
