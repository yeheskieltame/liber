import { test } from "node:test";
import assert from "node:assert/strict";
import { getQuote } from "./quote.js";

test("converts IDR amount to USDC using CoinGecko rate plus spread", async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ "usd-coin": { idr: 16000 } }), { status: 200 });

  const quote = await getQuote(32000, {
    fetchImpl: fakeFetch as typeof fetch,
    now: () => new Date("2026-07-15T00:00:00Z"),
  });

  // 32000 IDR / 16000 IDR-per-USDC = 2 USDC, + 1% spread = 2.02
  assert.equal(quote.amountUsdc, "2.02");
  assert.equal(quote.rateIdrPerUsdc, "16000");
  assert.equal(quote.expiresAt.toISOString(), "2026-07-15T00:00:30.000Z");
});

test("throws if CoinGecko response is missing the rate", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({}), { status: 200 });

  await assert.rejects(() => getQuote(32000, { fetchImpl: fakeFetch as typeof fetch }));
});
