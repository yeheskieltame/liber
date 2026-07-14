// backend/src/routes/webhooks.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createWebhooksRoute } from "./webhooks.js";

before(async () => {
  await migrate();
});

async function insertTestUserAndOrder(merchantOrderId: string): Promise<string> {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_api_key, idrx_api_secret) VALUES ($1, $2, $3) RETURNING id`,
    [`GWEBHOOKUSER${Math.random().toString(36).slice(2)}`, "user-api-key", Buffer.from("user-secret").toString("base64")]
  );
  const { rows: orderRows } = await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, from_account_address, state, idrx_merchant_order_id)
     VALUES ($1, 'qr', 'Merchant', 'Jakarta', 32000, 'GWEBHOOKUSER...', 'redeeming', $2) RETURNING id`,
    [userRows[0].id, merchantOrderId]
  );
  return orderRows[0].id;
}

// reconcile() runs fire-and-forget from the route handler (it responds 200
// before reconciliation against the real API finishes — see webhooks.ts).
// That means asserting on DB state right after the HTTP response races
// against reconcile's own DB round-trips. We observed this race empirically:
// without awaiting completion, the "MINTED" test failed in ~7/8 runs. Rather
// than paper over that with an arbitrary sleep, createWebhooksRoute exposes a
// test-only onReconciled hook that fires once reconcile() settles.
function waitForReconciliation(): { onReconciled: () => void; reconciled: Promise<void> } {
  let resolveReconciled!: () => void;
  const reconciled = new Promise<void>((resolve) => {
    resolveReconciled = resolve;
  });
  return { onReconciled: () => resolveReconciled(), reconciled };
}

test("POST /webhooks/idrx re-verifies via getTransactionHistory before trusting the payload", async () => {
  // idrx_merchant_order_id has no uniqueness constraint and reconcile()'s
  // lookup query has no ORDER BY, so a fixed literal id (as in the plan's
  // sample) collides with rows left behind by earlier runs against a
  // persistent dev DB and silently reconciles the wrong row. Generate a
  // unique id per test run, same as insertTestUser does for stellar_public_key.
  const merchantOrderId = `ORDER${Math.random().toString(36).slice(2)}`;
  const orderId = await insertTestUserAndOrder(merchantOrderId);
  const { onReconciled, reconciled } = waitForReconciliation();

  const app = createWebhooksRoute({
    getTransactionHistory: async () => ({ status: "MINTED" }),
    onReconciled,
  });

  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantOrderId, adminMintStatus: "MINTED" }),
  });

  assert.equal(res.status, 200);
  await reconciled;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "completed");
});

test("POST /webhooks/idrx does nothing when the real API disagrees with the payload", async () => {
  const merchantOrderId = `ORDER${Math.random().toString(36).slice(2)}`;
  const orderId = await insertTestUserAndOrder(merchantOrderId);
  const { onReconciled, reconciled } = waitForReconciliation();

  const app = createWebhooksRoute({
    getTransactionHistory: async () => ({ status: "PENDING" }),
    onReconciled,
  });

  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantOrderId, adminMintStatus: "MINTED" }),
  });

  assert.equal(res.status, 200);
  await reconciled;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "redeeming");
});

test("POST /webhooks/idrx returns 200 even with no merchantOrderId in the payload", async () => {
  const app = createWebhooksRoute({
    getTransactionHistory: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(res.status, 200);
});
