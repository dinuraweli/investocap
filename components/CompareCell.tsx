import { fmtRatio } from "@/lib/ratioFormat";
import type { RatioFormat } from "@/lib/reports/ratios";

/** A value cell in the comparison table. Percentage rows get a thin bar scaled to the largest value in the row. */
export function RatioRowCell({ value, format, all }: { value: number | null; format: RatioFormat; all: (number | null)[] }) {
  const max = Math.max(...all.map((v) => Math.abs(v ?? 0)), 0);
  return (
    <td className="px-2 py-2.5 text-right sm:px-3">
      <div className="money font-semibold">{fmtRatio(value, format)}</div>
      {format === "pct" && value !== null && max > 0 && (
        <div className="ml-auto mt-1 h-1 w-20 overflow-hidden rounded-full bg-[#eceef2]"><div className={`h-full rounded-full ${value < 0 ? "bg-loss" : "bg-brand"}`} style={{ width: `${Math.max((Math.abs(value) / max) * 100, 3)}%` }} /></div>
      )}
    </td>
  );
}
