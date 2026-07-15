import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { getQuote, saveKoloAddress, logScan, logTopup, getHistory } from "./api.js";

test("getQuote posts the IDR amount and returns the parsed quote", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/quote");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { amountIdr: 32000 });
    return new Response(
      JSON.stringify({ amountUsdc: "2.02", rateIdrPerUsdc: "16000", expiresAt: "2026-07-15T00:00:30.000Z" }),
      { status: 200 }
    );
  });

  const result = await getQuote(32000, fakeFetch as typeof fetch, "http://backend.test");

  assert.equal(result.amountUsdc, "2.02");
  assert.equal(result.rateIdrPerUsdc, "16000");
});

test("getQuote surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "amountIdr must be a positive number" }), { status: 400 });
  });

  await assert.rejects(getQuote(-5, fakeFetch as typeof fetch, "http://backend.test"), (err: Error) => {
    assert.equal(err.message, "amountIdr must be a positive number");
    return true;
  });
});

test("saveKoloAddress posts the address and returns it", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/kolo-address");
    assert.deepEqual(JSON.parse(init.body as string), { koloStellarAddress: "GKOLO..." });
    return new Response(JSON.stringify({ koloStellarAddress: "GKOLO..." }), { status: 200 });
  });

  const result = await saveKoloAddress("u1", "GKOLO...", fakeFetch as typeof fetch, "http://backend.test");
  assert.equal(result.koloStellarAddress, "GKOLO...");
});

test("logScan posts the scan details", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/scans");
    assert.deepEqual(JSON.parse(init.body as string), {
      merchantName: "Warung Kopi Asa",
      merchantCity: "Jakarta",
      amountIdr: "32000",
      amountUsdc: "2.02",
    });
    return new Response(JSON.stringify({ id: "s1" }), { status: 201 });
  });

  const result = await logScan(
    "u1",
    { merchantName: "Warung Kopi Asa", merchantCity: "Jakarta", amountIdr: "32000", amountUsdc: "2.02" },
    fakeFetch as typeof fetch,
    "http://backend.test"
  );
  assert.equal(result.id, "s1");
});

test("logTopup posts the topup details", async () => {
  const fakeFetch = mock.fn(async (url: string, init: RequestInit) => {
    assert.equal(url, "http://backend.test/users/u1/topups");
    assert.deepEqual(JSON.parse(init.body as string), { amountUsdc: "5.00", stellarTxHash: "hash1" });
    return new Response(JSON.stringify({ id: "t1" }), { status: 201 });
  });

  const result = await logTopup(
    "u1",
    { amountUsdc: "5.00", stellarTxHash: "hash1" },
    fakeFetch as typeof fetch,
    "http://backend.test"
  );
  assert.equal(result.id, "t1");
});

test("getHistory returns the merged entries list", async () => {
  const fakeFetch = mock.fn(async (url: string) => {
    assert.equal(url, "http://backend.test/users/u1/history");
    return new Response(
      JSON.stringify({
        entries: [
          { type: "topup", id: "t1", amountUsdc: "5.00", stellarTxHash: "hash1", createdAt: "2026-07-15T01:00:00.000Z" },
          { type: "scan", id: "s1", merchantName: "Warung Kopi Asa", merchantCity: "Jakarta", amountIdr: "32000", amountUsdc: "2.02", createdAt: "2026-07-15T00:00:00.000Z" },
        ],
      }),
      { status: 200 }
    );
  });

  const result = await getHistory("u1", fakeFetch as typeof fetch, "http://backend.test");
  assert.equal(result.length, 2);
  assert.equal(result[0].type, "topup");
  assert.equal(result[1].type, "scan");
});

test("getHistory surfaces the backend's error message on a non-OK response", async () => {
  const fakeFetch = mock.fn(async () => {
    return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  });

  await assert.rejects(getHistory("u1", fakeFetch as typeof fetch, "http://backend.test"), (err: Error) => {
    assert.equal(err.message, "user not found");
    return true;
  });
});
