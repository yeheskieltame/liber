// backend/src/routes/orders.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { insertOrder } from "../orders/repository.js";
import { buildQris } from "../qris/test-helpers.js";
import { createOrdersRoute } from "./orders.js";
import type { OrderState } from "../orders/state-machine.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GTESTUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

async function insertOrderWithState(userId: string, state: OrderState): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, quote_expires_at, from_account_address, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      userId,
      "irrelevant-for-this-test",
      "Warung Kopi Asa",
      "Jakarta",
      "32000",
      "2.02",
      new Date(Date.now() + 30_000),
      "GFROMACCOUNT...",
      state,
    ]
  );
  return rows[0].id;
}

test("POST /orders parses QRIS, quotes it, and returns an unsigned payment XDR", async () => {
  const userId = await insertTestUser();

  const app = createOrdersRoute({
    getQuote: async () => ({
      amountUsdc: "2.02",
      rateIdrPerUsdc: "16000",
      expiresAt: new Date(Date.now() + 30_000),
    }),
    buildPaymentTx: async () => ({ unsignedXdr: "FAKE_UNSIGNED_XDR" }),
  });

  const qrContent = buildQris([
    ["00", "01"],
    ["01", "12"],
    ["53", "360"],
    ["54", "32000"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedPaymentXdr, "FAKE_UNSIGNED_XDR");
  assert.equal(body.amountUsdc, "2.02");
  assert.equal(body.merchantName, "Warung Kopi Asa");
  assert.equal(body.merchantCity, "Jakarta");
  assert.equal(body.amountIdr, "32000");
  assert.ok(body.orderId);
  assert.ok(body.quoteExpiresAt);
});

test("POST /orders returns 404 when the user does not exist", async () => {
  const app = createOrdersRoute();
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

  const app = createOrdersRoute();
  const res = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(res.status, 400);
});

test("POST /orders returns 400 for a non-numeric amountIdr query param", async () => {
  const userId = await insertTestUser();

  const qrContent = buildQris([
    ["00", "01"],
    ["01", "11"],
    ["53", "360"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const app = createOrdersRoute();
  const res = await app.request("/orders?amountIdr=abc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(res.status, 400);
});

test("POST /orders returns 409 when the user already has an order in progress", async () => {
  const userId = await insertTestUser();

  const app = createOrdersRoute({
    getQuote: async () => ({
      amountUsdc: "2.02",
      rateIdrPerUsdc: "16000",
      expiresAt: new Date(Date.now() + 30_000),
    }),
    buildPaymentTx: async () => ({ unsignedXdr: "FAKE_UNSIGNED_XDR" }),
  });

  const qrContent = buildQris([
    ["00", "01"],
    ["01", "12"],
    ["53", "360"],
    ["54", "32000"],
    ["58", "ID"],
    ["59", "Warung Kopi Asa"],
    ["60", "Jakarta"],
  ]);

  const firstRes = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });
  assert.equal(firstRes.status, 201);
  const firstBody = await firstRes.json();

  const pool = getPool();
  const { rows } = await pool.query("SELECT state FROM orders WHERE id = $1", [firstBody.orderId]);
  assert.notEqual(rows[0].state, "completed");
  assert.notEqual(rows[0].state, "failed");

  const secondRes = await app.request("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, qrContent }),
  });

  assert.equal(secondRes.status, 409);
  const secondBody = await secondRes.json();
  assert.equal(secondBody.error, "an order is already in progress for this user");
});

test("POST /orders/:id/approve submits the signed XDR and transitions to awaiting_settlement", async () => {
  const userId = await insertTestUser();
  const order = await insertOrder({
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  const app = createOrdersRoute({
    submitStellarTx: async () => ({ hash: "FAKE_STELLAR_TX_HASH" }),
  });

  const res = await app.request(`/orders/${order.id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "awaiting_settlement");
  assert.equal(body.stellarTxHash, "FAKE_STELLAR_TX_HASH");

  const pool = getPool();
  const { rows } = await pool.query("SELECT state, stellar_tx_hash FROM orders WHERE id = $1", [order.id]);
  assert.equal(rows[0].state, "awaiting_settlement");
  assert.equal(rows[0].stellar_tx_hash, "FAKE_STELLAR_TX_HASH");
});

test("POST /orders/:id/approve surfaces payment submission failures as a 502 and marks the order failed", async () => {
  const userId = await insertTestUser();
  const order = await insertOrder({
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  const app = createOrdersRoute({
    submitStellarTx: async () => {
      throw new Error("Horizon rejected the transaction");
    },
  });

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
  assert.equal(rows[0].failure_reason, "Horizon rejected the transaction");
});

test("POST /orders/:id/approve returns 404 for an unknown order", async () => {
  const app = createOrdersRoute();
  const res = await app.request("/orders/00000000-0000-0000-0000-000000000000/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 404);
});

test("POST /orders/:id/approve returns 409 when order is not in quoted state", async () => {
  const userId = await insertTestUser();
  const orderId = await insertOrderWithState(userId, "awaiting_settlement");

  const app = createOrdersRoute({
    submitStellarTx: async () => ({ hash: "FAKE_STELLAR_TX_HASH" }),
  });

  const res = await app.request(`/orders/${orderId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_XDR" }),
  });

  assert.equal(res.status, 409);
  const body = await res.json();
  assert.match(body.error, /Cannot apply event "user_approved" to state "awaiting_settlement"/);

  const pool = getPool();
  const { rows } = await pool.query("SELECT state FROM orders WHERE id = $1", [orderId]);
  assert.equal(rows[0].state, "awaiting_settlement");
});

test("POST /orders/:id/settle transitions awaiting_settlement to completed when the admin secret matches", async () => {
  process.env.ADMIN_SECRET = "test-admin-secret";
  const userId = await insertTestUser();
  const orderId = await insertOrderWithState(userId, "awaiting_settlement");

  const app = createOrdersRoute();
  const res = await app.request(`/orders/${orderId}/settle`, {
    method: "POST",
    headers: { "x-admin-secret": "test-admin-secret" },
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "completed");

  const pool = getPool();
  const { rows } = await pool.query("SELECT state FROM orders WHERE id = $1", [orderId]);
  assert.equal(rows[0].state, "completed");
});

test("POST /orders/:id/settle returns 403 when the admin secret is missing or wrong", async () => {
  process.env.ADMIN_SECRET = "test-admin-secret";
  const userId = await insertTestUser();
  const orderId = await insertOrderWithState(userId, "awaiting_settlement");

  const app = createOrdersRoute();
  const res = await app.request(`/orders/${orderId}/settle`, {
    method: "POST",
    headers: { "x-admin-secret": "wrong-secret" },
  });

  assert.equal(res.status, 403);

  const pool = getPool();
  const { rows } = await pool.query("SELECT state FROM orders WHERE id = $1", [orderId]);
  assert.equal(rows[0].state, "awaiting_settlement");
});

test("POST /orders/:id/settle returns 409 when the order is not awaiting_settlement", async () => {
  process.env.ADMIN_SECRET = "test-admin-secret";
  const userId = await insertTestUser();
  const orderId = await insertOrderWithState(userId, "quoted");

  const app = createOrdersRoute();
  const res = await app.request(`/orders/${orderId}/settle`, {
    method: "POST",
    headers: { "x-admin-secret": "test-admin-secret" },
  });

  assert.equal(res.status, 409);
});

test("POST /orders/:id/settle returns 404 for an unknown order", async () => {
  process.env.ADMIN_SECRET = "test-admin-secret";
  const app = createOrdersRoute();
  const res = await app.request("/orders/00000000-0000-0000-0000-000000000000/settle", {
    method: "POST",
    headers: { "x-admin-secret": "test-admin-secret" },
  });

  assert.equal(res.status, 404);
});

test("GET /orders/:id returns order status", async () => {
  const userId = await insertTestUser();
  const order = await insertOrder({
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  });

  const app = createOrdersRoute();
  const res = await app.request(`/orders/${order.id}`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.state, "quoted");
  assert.equal(body.merchantName, "Warung Kopi Asa");
  assert.equal(body.amountIdr, "32000");
  assert.equal(body.amountUsdc, "2.02");
  assert.equal(body.stellarTxHash, null);
  assert.equal(body.failureReason, null);
});

test("GET /orders/:id returns 404 for an unknown order", async () => {
  const app = createOrdersRoute();
  const res = await app.request("/orders/00000000-0000-0000-0000-000000000000");
  assert.equal(res.status, 404);
});
