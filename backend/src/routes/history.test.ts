// backend/src/routes/history.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";

before(async () => {
  await migrate();
});

test("GET /users/:id/orders returns past orders newest first", async () => {
  const pool = getPool();
  const { rows: userRows } = await pool.query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    [`GHISTORYUSER${Math.random().toString(36).slice(2)}`]
  );
  const userId = userRows[0].id;

  await pool.query(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, from_account_address, state, stellar_tx_hash, created_at)
     VALUES ($1, 'qr1', 'Warung A', 'Jakarta', 10000, '0.62', 'G...', 'completed', 'hash1', now() - interval '1 hour'),
            ($1, 'qr2', 'Warung B', 'Bandung', 20000, '1.25', 'G...', 'completed', 'hash2', now())`,
    [userId]
  );

  const app = createApp();
  const res = await app.request(`/users/${userId}/orders`);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.orders.length, 2);
  assert.equal(body.orders[0].merchantName, "Warung B"); // newest first
  assert.equal(body.orders[1].merchantName, "Warung A");
});
