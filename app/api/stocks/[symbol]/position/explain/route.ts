import { requireSession } from "@/lib/auth";
import { findQuote, getStockHistory } from "@/lib/cse/service";
import { colomboDate } from "@/lib/time";
import { listTransactions } from "@/lib/db/user-data";
import { BadRequest, fail, handle, json, NotFound } from "@/lib/http";
import { computeHoldingTimeline, firstPurchaseDate, holdingMetrics } from "@/lib/holding";
import { computePositions } from "@/lib/portfolio";
import { POSITION_SCHEMA, POSITION_SYSTEM, positionPrompt, validatePositionExplanation } from "@/lib/reports/explain";
import { checkKey, GeminiError, generateJson } from "@/lib/reports/gemini";
import { allow } from "@/lib/reports/limits";
import { readGeminiKey } from "@/lib/reports/request";

export const maxDuration = 60;

/** Plain-English write-up of the user's position, from their own figures, using their own Gemini key. Facts only. */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ symbol: string }> }) => {
  const { user, db } = await requireSession();
  const quote = await findQuote(decodeURIComponent((await params).symbol));
  if (!quote) throw new NotFound("Unknown symbol");
  const key = readGeminiKey(req);

  const txs = (await listTransactions(db)).filter((t) => t.symbol === quote.symbol);
  const pos = computePositions(txs).positions.find((p) => p.symbol === quote.symbol);
  if (!pos) throw new BadRequest("You don't hold this stock.");
  if (!allow(user.id, "position", 30)) throw new BadRequest("You've used 30 explanations in the last hour. Please wait a while.");

  const { points } = await getStockHistory(quote, "ALL");
  const closes: [string, number][] = [...points].sort((a, b) => a.t - b.t).map((p) => [colomboDate(p.t), p.price]);
  if (quote.price > 0) closes.push([colomboDate(Date.now()), quote.price]);
  const metrics = holdingMetrics(computeHoldingTimeline(txs, closes, quote.symbol));

  const price = quote.price > 0 ? quote.price : pos.avgCost;
  const marketValue = pos.quantity * price;
  try {
    const { models } = await checkKey(key);
    const { result, model, attempts } = await generateJson(key, models, {
      system: POSITION_SYSTEM,
      text: positionPrompt({
        company: quote.name, quantity: pos.quantity, avgCost: pos.avgCost, currentPrice: price, invested: pos.costBasis, marketValue,
        unrealised: marketValue - pos.costBasis, returnPct: pos.costBasis > 0 ? ((marketValue - pos.costBasis) / pos.costBasis) * 100 : 0,
        firstPurchase: firstPurchaseDate(txs), highClose: metrics.highClose, lowClose: metrics.lowClose, bestDay: metrics.bestDay, worstDay: metrics.worstDay,
      }),
      schema: POSITION_SCHEMA, validate: validatePositionExplanation,
    });
    return json({ ...result, model, attempts, generatedAt: new Date().toISOString() });
  } catch (e) {
    if (e instanceof GeminiError) { console.warn("[position explain] gemini failure", { code: e.code, status: e.status }); return fail(e.status, e.message); }
    throw e;
  }
});
