// Parses an ATrad "Portfolio - EQUITY" export (already read into rows by a spreadsheet reader).
// Layout: a title row, a header row ("Security", "Quantity", "Avg Price", "Total Cost", ...), one row per
// holding, then a "Total" row. Total Cost already includes buying brokerage, so it is the cost basis.

export interface ImportPosition {
  symbol: string; // e.g. "JKH.N0000"
  quantity: number;
  totalCost: number; // LKR, including buying costs
  unsettledBuy: number;
  unsettledSell: number;
}

export interface ParseResult {
  positions: ImportPosition[];
  warnings: string[];
}

export class ImportFormatError extends Error {}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const SYMBOL_RE = /^[A-Z0-9]+\.[A-Z]\d{4}$/;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseAtradRows(rows: unknown[][]): ParseResult {
  const headerIdx = rows.findIndex((r) => {
    const cells = r.map(norm);
    return cells.includes("security") && cells.includes("quantity") && (cells.includes("totalcost") || cells.includes("avgprice"));
  });
  if (headerIdx === -1) throw new ImportFormatError('This doesn\'t look like an ATrad portfolio export (no "Security / Quantity / Avg Price" header found).');

  const col = new Map<string, number>();
  rows[headerIdx].forEach((h, i) => col.set(norm(h), i));
  const at = (row: unknown[], key: string) => (col.has(key) ? row[col.get(key)!] : undefined);

  const warnings: string[] = [];
  const merged = new Map<string, ImportPosition>();

  for (const row of rows.slice(headerIdx + 1)) {
    const first = String(row[col.get("security")!] ?? "").trim();
    if (!first) continue; // blank spacer row
    if (/^total/i.test(first)) break; // summary row ends the table

    const symbol = first.toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      warnings.push(`Skipped "${first}": not a recognisable CSE symbol.`);
      continue;
    }
    const quantity = num(at(row, "quantity"));
    if (quantity === null || quantity <= 0) {
      warnings.push(`Skipped ${symbol}: quantity is ${quantity === null ? "missing" : quantity}.`);
      continue;
    }
    let totalCost = num(at(row, "totalcost"));
    if (totalCost === null) {
      const avg = num(at(row, "avgprice"));
      if (avg !== null) totalCost = avg * quantity;
    }
    if (totalCost === null || totalCost < 0) {
      warnings.push(`Skipped ${symbol}: cost is missing.`);
      continue;
    }
    const unsettledBuy = num(at(row, "unsettledbuy")) ?? 0;
    const unsettledSell = num(at(row, "unsettledsell")) ?? 0;

    const prev = merged.get(symbol);
    merged.set(symbol, prev
      ? { ...prev, quantity: prev.quantity + quantity, totalCost: prev.totalCost + totalCost, unsettledBuy: prev.unsettledBuy + unsettledBuy, unsettledSell: prev.unsettledSell + unsettledSell }
      : { symbol, quantity, totalCost, unsettledBuy, unsettledSell });
  }

  const positions = [...merged.values()].sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
  for (const p of positions) {
    if (p.unsettledBuy || p.unsettledSell) warnings.push(`${p.symbol} has unsettled trades (buy ${p.unsettledBuy}, sell ${p.unsettledSell}). Check the quantity once they settle.`);
  }
  if (positions.length === 0) throw new ImportFormatError("No holdings were found in this file.");
  return { positions, warnings };
}
