import { test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "./pool.js";
import { migrate } from "./migrate.js";

test("migrate creates users and orders tables", async (t) => {
  t.after(() => getPool().end());
  await migrate();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'orders')`
  );
  assert.equal(rows.length, 2);

  // Verify orders table columns
  const { rows: orderColumns } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'orders'`
  );
  const columnNames = orderColumns.map((r) => r.column_name);
  for (const expected of [
    "id", "user_id", "qr_content", "merchant_name", "merchant_city", "amount_idr",
    "amount_usdc", "quote_rate", "quote_expires_at", "state", "from_account_address",
    "stellar_tx_hash", "failure_reason", "created_at", "updated_at",
  ]) {
    assert.ok(columnNames.includes(expected), `missing column: ${expected}`);
  }
});
