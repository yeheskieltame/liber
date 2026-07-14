// backend/src/routes/orders.test.ts
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { insertOrder } from "../orders/repository.js";
import { buildQris } from "../qris/test-helpers.js";

// NOTE on mocking strategy:
// node:test's `mock.method(namespaceObject, "name", ...)` cannot patch real ES
// module named exports -- module namespace objects expose their bindings as
// non-configurable properties, so the `Object.defineProperty` call inside
// `mock.method` throws "Cannot redefine property". Verified directly against
// this repo's Node 25 + tsx ESM setup before writing this file.
//
// The working equivalent is `mock.module()` (node:test's dedicated ESM
// module-mocking API, enabled by --experimental-test-module-mocks in
// package.json's test script), paired with long-lived `mock.fn()` instances
// so each test can still reprogram behavior and inspect calls the way
// `mock.method` would normally allow.
//
// A module's imports are resolved once, at first evaluation, and are never
// re-linked -- so the mocks below must be registered *before* the first
// (dynamic) import of app.js. Every test in this file shares that one App
// instance and just reprograms the mock.fn()s per case.
type GetQuoteFn = typeof import("../quote/quote.js")["getQuote"];
type BuildBridgeTxFn = typeof import("../bridge/allbridge.js")["buildBridgeTx"];
type SubmitBridgeTxFn = typeof import("../bridge/allbridge.js")["submitBridgeTx"];
type CreateAppFn = typeof import("../app.js")["createApp"];

const getQuoteMock = mock.fn<GetQuoteFn>(async () => {
  throw new Error("getQuote not stubbed for this test");
});
const buildBridgeTxMock = mock.fn<BuildBridgeTxFn>(async () => {
  throw new Error("buildBridgeTx not stubbed for this test");
});
const submitBridgeTxMock = mock.fn<SubmitBridgeTxFn>(async () => {
  throw new Error("submitBridgeTx not stubbed for this test");
});

let createApp: CreateAppFn;

before(async () => {
  await migrate();
  mock.module("../quote/quote.js", { namedExports: { getQuote: getQuoteMock } });
  mock.module("../bridge/allbridge.js", {
    namedExports: { buildBridgeTx: buildBridgeTxMock, submitBridgeTx: submitBridgeTxMock },
  });
  ({ createApp } = await import("../app.js"));
});

async function insertTestUser(provider = "other"): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_deposit_address, provider) VALUES ($1, $2, $3) RETURNING id`,
    [`GTESTUSER${Math.random().toString(36).slice(2)}`, "0xDEPOSIT...", provider]
  );
  return rows[0].id;
}

test("POST /orders parses QRIS, quotes it, and returns an unsigned bridge XDR", async () => {
  const userId = await insertTestUser();

  getQuoteMock.mock.mockImplementation(async () => ({
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    expiresAt: new Date(Date.now() + 30_000),
  }));
  buildBridgeTxMock.mock.mockImplementation(async () => ({ unsignedXdr: "FAKE_UNSIGNED_XDR" }));

  const qrContent = buildQris([
    ["00", "01"],
    ["01", "12"],
    ["53", "360"],
    ["54", "32000"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const app = createApp();
  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedBridgeXdr, "FAKE_UNSIGNED_XDR");
  assert.equal(body.amountUsdc, "2.02");
  assert.equal(body.merchantName, "Warung Kopi Asa");
  assert.equal(body.merchantCity, "Jakarta");
  assert.equal(body.amountIdr, "32000");
  assert.ok(body.orderId);
  assert.ok(body.quoteExpiresAt);
});

test("POST /orders returns 404 when the user does not exist", async () => {
  const app = createApp();
  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: "00000000-0000-0000-0000-000000000000",
      qrContent: "irrelevant",
    }),
  });

  assert.equal(res.status, 404);
});

test("POST /orders returns 400 for static QRIS without an amountIdr query param", async () => {
  const userId = await insertTestUser();

  const qrContent = buildQris([
    ["00", "01"],
    ["01", "11"],
    ["53", "360"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const app = createApp();
  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(res.status, 400);
});

test("POST /orders/:id/approve submits the signed XDR and transitions to bridging", async () => {
  const userId = await insertTestUser();
  const order = await insertOrder({
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  submitBridgeTxMock.mock.mockImplementation(async () => ({ hash: "FAKE_STELLAR_TX_HASH" }));

  const app = createApp();
  const res = await app.request(`/orders/${order.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "bridging");
  assert.equal(body.stellarTxHash, "FAKE_STELLAR_TX_HASH");

  const pool = getPool();
  const { rows } = await pool.query("SELECT state, stellar_tx_hash FROM orders WHERE id = $1", [order.id]);
  assert.equal(rows[0].state, "bridging");
  assert.equal(rows[0].stellar_tx_hash, "FAKE_STELLAR_TX_HASH");
});

test("POST /orders/:id/approve surfaces bridge submission failures as a 502 and marks the order failed", async () => {
  const userId = await insertTestUser();
  const order = await insertOrder({
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  submitBridgeTxMock.mock.mockImplementation(async () => {
    throw new Error("bridge rejected the transaction");
  });

  const app = createApp();
  const res = await app.request(`/orders/${order.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.state, "failed");

  const pool = getPool();
  const { rows } = await pool.query("SELECT state, failure_reason FROM orders WHERE id = $1", [order.id]);
  assert.equal(rows[0].state, "failed");
  assert.equal(rows[0].failure_reason, "bridge rejected the transaction");
});

test("POST /orders/:id/approve returns 404 for an unknown order", async () => {
  const app = createApp();
  const res = await app.request("/orders/00000000-0000-0000-0000-000000000000/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 404);
});

test("GET /orders/:id returns order status plus e-wallet handoff for the owner's provider", async () => {
  const userId = await insertTestUser("gopay");
  const qrContent = buildQris([
    ["00", "01"],
    ["01", "11"],
    ["53", "360"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);
  const order = await insertOrder({
    userId,
    qrContent,
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  const app = createApp();
  const res = await app.request(`/orders/${order.id}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "quoted");
  assert.equal(body.merchantName, "Warung Kopi Asa");
  assert.equal(body.amountIdr, "32000");
  assert.equal(body.amountUsdc, "2.02");
  assert.equal(body.stellarTxHash, null);
  assert.equal(body.failureReason, null);
  assert.deepEqual(body.ewalletHandoff, { appLink: "gojek://gopay", qrContent });
});

test("GET /orders/:id returns 404 for an unknown order", async () => {
  const app = createApp();
  const res = await app.request("/orders/00000000-0000-0000-0000-000000000000");
  assert.equal(res.status, 404);
});
