const PALETTE = ["#3b2fe0", "#0f9d6b", "#e8730c", "#27a4e8", "#8b3fe8", "#d9467a", "#9aa0ad", "#b8a000"];
/** Stable colour per key (sector or symbol) so the donut, legend and badges agree. */
export function sectorColor(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
