// backend/src/routes/webhooks.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createWebhooksRoute } from "./webhooks.js";
import type { OrderState } from "../orders/state-machine.js";

before(async () => {
  await migrate();
});

async function insertTestUser(depositAddress: string): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_deposit_address) VALUES ($1, $2) RETURNING id`,
    [`GWEBHOOKUSER${Math.random().toString(36).slice(2)}`, depositAddress]
  );
  return rows[0].id;
}

async function insertOrderInState(userId: string, state: OrderState): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, from_account_address, state)
     VALUES ($1, 'qr', 'Merchant', 'Jakarta', 32000, 'GWEBHOOKUSER...', $2) RETURNING id`,
    [userId, state]
  );
  return rows[0].id;
}

// reconcile() runs fire-and-forget from the route handler (it responds 200
// before reconciliation against the real API finishes — see webhooks.ts).
// That means asserting on DB state right after the HTTP response races
// against reconcile's own DB round-trips. createWebhooksRoute exposes a
// test-only onReconciled hook that fires once reconcile() settles.
function waitForReconciliation(): { onReconciled: () => void; reconciled: Promise<void> } {
  let resolveReconciled!: () => void;
  const reconciled = new Promise<void>((resolve) => {
    resolveReconciled = resolve;
  });
  return { onReconciled: () => resolveReconciled(), reconciled };
}

test("POST /webhooks/idrx re-verifies via getRedeemByTransferTxHash and drives bridging -> completed in one pass", async () => {
  const depositAddress = `0xDEPOSIT${Math.random().toString(36).slice(2)}`;
  const userId = await insertTestUser(depositAddress);
  const orderId = await insertOrderInState(userId, "bridging");
  const { onReconciled, reconciled } = waitForReconciliation();

  const app = createWebhooksRoute({
    getRedeemByTransferTxHash: async () => ({
      address: depositAddress,
      status: "SUCCESS",
      amountFrom: "32000",
      transferTxHash: "0xTRANSFER1",
    }),
    onReconciled,
  });

  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      depositRedeemRequest: { address: depositAddress, transferTxHash: "0xTRANSFER1", status: "SUCCESS" },
    }),
  });

  assert.equal(res.status, 200);
  await reconciled;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "completed");
});

test("POST /webhooks/idrx does nothing when the trusted API disagrees with what the payload claims", async () => {
  const depositAddress = `0xDEPOSIT${Math.random().toString(36).slice(2)}`;
  const userId = await insertTestUser(depositAddress);
  const orderId = await insertOrderInState(userId, "bridging");
  const { onReconciled, reconciled } = waitForReconciliation();

  const app = createWebhooksRoute({
    // The payload below claims status "SUCCESS", but reconcile() never reads
    // the payload's own status/address — only its transferTxHash, used to
    // re-query the trusted API. The trusted API disagrees here, so nothing
    // should change.
    getRedeemByTransferTxHash: async () => ({
      address: depositAddress,
      status: "PENDING",
      amountFrom: "32000",
      transferTxHash: "0xTRANSFER2",
    }),
    onReconciled,
  });

  const res = await app.request("/webhooks/idrx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      depositRedeemRequest: { address: depositAddress, transferTxHash: "0xTRANSFER2", status: "SUCCESS" },
    }),
  });

  assert.equal(res.status, 200);
  await reconciled;

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "bridging");
});

test("POST /webhooks/idrx returns 200 and does not crash when depositRedeemRequest/txHash is absent", async () => {
  const app = createWebhooksRoute({
    getRedeemByTransferTxHash: async () => {
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
