// backend/src/routes/history.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

before(async () => {
  await migrate();
});

test("GET /users/:id/orders returns past orders newest first with all fields", async () => {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    [`GHISTORYUSER${Math.random().toString(36).slice(2)}`]
  );
  const userId = userRows[0].id;

  await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, from_account_address, state, stellar_tx_hash, created_at)
     VALUES ($1, 'qr1', 'Warung A', 'Jakarta', 10000, '0.62', 'G...', 'pending', 'hash1', now() - interval '1 hour'),
            ($1, 'qr2', 'Warung B', 'Bandung', 20000, '1.25', 'G...', 'completed', 'hash2', now())`,
    [userId]
  );

  // Query back to get the inserted order IDs for assertion
  const { rows: allOrders } = await pool.query(
    `SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at ASC`,
    [userId]
  );
  const order1Id = allOrders[0].id;
  const order2Id = allOrders[1].id;

  const app = createApp();
  const res = await app.request(`/users/${userId}/orders`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.orders.length, 2);

  // Verify newest order first
  assert.equal(body.orders[0].merchantName, "Warung B");
  assert.equal(body.orders[0].merchantCity, "Bandung");
  assert.equal(body.orders[0].amountIdr, "20000");
  assert.equal(body.orders[0].amountUsdc, "1.25");
  assert.equal(body.orders[0].state, "completed");
  assert.equal(body.orders[0].stellarTxHash, "hash2");
  assert.equal(body.orders[0].orderId, order2Id);
  assert(body.orders[0].createdAt, "createdAt should be present");
  assert(new Date(body.orders[0].createdAt), "createdAt should be a valid date");

  // Verify oldest order second
  assert.equal(body.orders[1].merchantName, "Warung A");
  assert.equal(body.orders[1].merchantCity, "Jakarta");
  assert.equal(body.orders[1].amountIdr, "10000");
  assert.equal(body.orders[1].amountUsdc, "0.62");
  assert.equal(body.orders[1].state, "pending");
  assert.equal(body.orders[1].stellarTxHash, "hash1");
  assert.equal(body.orders[1].orderId, order1Id);
  assert(body.orders[1].createdAt, "createdAt should be present");
  assert(new Date(body.orders[1].createdAt), "createdAt should be a valid date");
});

test("GET /users/:id/orders returns 404 for nonexistent user", async () => {
  const app = createApp();
  const nonexistentUserId = "00000000-0000-0000-0000-000000000000";
  const res = await app.request(`/users/${nonexistentUserId}/orders`);
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error, "user not found");
});
