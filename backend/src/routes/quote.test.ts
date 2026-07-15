import { test } from "node:test";
import assert from "node:assert/strict";
import { createQuoteRoute } from "./quote.js";

test("POST /quote returns the converted USDC amount and rate", async () => {
  const app = createQuoteRoute({
    getQuote: async (amountIdr: number) => ({
      amountUsdc: (amountIdr / 16000).toFixed(2),
      rateIdrPerUsdc: "16000",
      expiresAt: new Date("2026-07-15T00:00:30.000Z"),
    }),
  });

  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: 32000 }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.amountUsdc, "2.00");
  assert.equal(body.rateIdrPerUsdc, "16000");
  assert.equal(body.expiresAt, "2026-07-15T00:00:30.000Z");
});

test("POST /quote returns 400 for a non-positive amountIdr", async () => {
  const app = createQuoteRoute();
  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: -5 }),
  });
  assert.equal(res.status, 400);
});

test("POST /quote returns 400 for a non-numeric amountIdr", async () => {
  const app = createQuoteRoute();
  const res = await app.request("/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountIdr: "abc" }),
  });
  assert.equal(res.status, 400);
});
