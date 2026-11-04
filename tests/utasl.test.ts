import { test } from "node:test";
import assert from "node:assert/strict";
import { FundParseError, fundType, parseUnitPrices } from "../lib/funds/utasl.ts";

// Mirrors the real UTASL markup (invented numbers).
const PAGE = `<div><table>
<tr><th>Company</th><th>Fund Name</th><th>Selling Price (LKR)</th><th>Buying Price (LKR)</th></tr>
<tr><td>Example Asset Management Pvt Ltd</td><td>Example Cash Management Trust Fund</td><td>47.4253</td><td>47.4253</td></tr>
<tr><td>Example Asset Management Pvt Ltd</td><td>Example Equity Income Fund</td><td>16.6277</td><td>16.2744</td></tr>
<tr><td>Beta Capital &amp; Co Ltd</td><td>Beta Gilt-Edged Fund</td><td>Rs. 1,222.97</td><td>1,220.00</td></tr>
<tr><td></td><td>Orphan row no manager</td><td>1</td><td>1</td></tr>
<tr><td>Z Co</td><td>Z Fund</td><td>n/a</td><td>-</td></tr>
</table></div>`;

test("parses the funds table: manager, name, both prices, and a type", () => {
  const funds = parseUnitPrices(PAGE);
  assert.equal(funds.length, 3); // header, orphan and no-price rows dropped
  assert.deepEqual(funds[0], { slug: "example-cash-management-trust-fund", name: "Example Cash Management Trust Fund", manager: "Example Asset Management Pvt Ltd", sell: 47.4253, buy: 47.4253, type: "Money Market" });
  assert.equal(funds[1].type, "Equity"); // "Equity Income" is an equity fund
});

test("decodes HTML entities and parses prices with commas and currency", () => {
  const f = parseUnitPrices(PAGE)[2];
  assert.equal(f.manager, "Beta Capital & Co Ltd");
  assert.equal(f.sell, 1222.97);
  assert.equal(f.buy, 1220);
  assert.equal(f.type, "Gilt");
});

test("slugs are stable and de-duplicated", () => {
  const dup = parseUnitPrices(`<table>
    <tr><td>A</td><td>Growth Fund</td><td>10</td><td>10</td></tr>
    <tr><td>B</td><td>Growth Fund</td><td>20</td><td>20</td></tr></table>`);
  assert.deepEqual(dup.map((f) => f.slug), ["growth-fund", "growth-fund-2"]);
});

test("fundType classifies common Sri Lankan fund names", () => {
  assert.equal(fundType("NDB Wealth Money Market Fund"), "Money Market");
  assert.equal(fundType("First Capital Gilt Edged Fund"), "Gilt");
  assert.equal(fundType("JB Vantage Value Equity Fund"), "Equity");
  assert.equal(fundType("Senfin Income Fund"), "Income");
  assert.equal(fundType("Capital Alliance Balanced Fund"), "Balanced");
  assert.equal(fundType("NAMAL Acuity Shariah Fund"), "Shariah");
  assert.equal(fundType("Something Unusual Trust"), "Other");
});

test("a missing or empty table throws, so a layout change fails loudly", () => {
  assert.throws(() => parseUnitPrices("<html>no table here</html>"), FundParseError);
  assert.throws(() => parseUnitPrices("<table><tr><th>Company</th></tr></table>"), FundParseError);
});
