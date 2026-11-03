import { test } from "node:test";
import assert from "node:assert/strict";
import { yRange } from "../lib/chart.ts";

test("yRange spans every series and pads", () => {
  const r = yRange([{ values: [10, 20, null] }, { values: [5, 30] }], false);
  assert.ok(r.lo < 5 && r.hi > 30);
});

test("yRange includes zero for the gain chart", () => {
  const r = yRange([{ values: [100, 200, 150] }], true);
  assert.ok(r.lo <= 0, "range reaches zero so the baseline shows");
  const neg = yRange([{ values: [-50, -120] }], true);
  assert.ok(neg.hi >= 0);
});

test("yRange copes with a flat series and all-null input", () => {
  const flat = yRange([{ values: [7, 7, 7] }], false);
  assert.ok(flat.lo < 7 && flat.hi > 7);
  assert.deepEqual(yRange([{ values: [null, null] }], false), { lo: 0, hi: 1 });
});
