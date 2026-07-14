// backend/src/bridge/poller.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { pollBridgingOrders } from "./poller.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GPOLLERUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

async function insertBridgingOrder(userId: string, stellarTxHash: string, stale: boolean): Promise<string> {
  const pool = getPool();
  const updatedAtExpr = stale ? `now() - interval '10 minutes'` : `now()`;
  const { rows } = await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, from_account_address, state, stellar_tx_hash, updated_at)
     VALUES ($1, 'qr', 'Merchant', 'Jakarta', 32000, 'GFROMACCOUNT...', 'bridging', $2, ${updatedAtExpr}) RETURNING id`,
    [userId, stellarTxHash]
  );
  return rows[0].id;
}

test("pollBridgingOrders marks a stale bridging order failed when the bridge reports failure", async () => {
  const userId = await insertTestUser();
  const orderId = await insertBridgingOrder(userId, "STALE_TX_HASH", true);

  await pollBridgingOrders({ getBridgeStatus: async () => "failed" });

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state, failure_reason FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "failed");
  assert.ok(rows[0].failure_reason);
});

test("pollBridgingOrders leaves a fresh bridging order alone even if the bridge would report failure", async () => {
  const userId = await insertTestUser();
  const orderId = await insertBridgingOrder(userId, "FRESH_TX_HASH", false);

  await pollBridgingOrders({ getBridgeStatus: async () => "failed" });

  const pool = getPool();
  const { rows } = await pool.query(`SELECT state FROM orders WHERE id = $1`, [orderId]);
  assert.equal(rows[0].state, "bridging");
});
