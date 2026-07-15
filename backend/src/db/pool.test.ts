import { test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "./pool.js";
import { migrate } from "./migrate.js";

test("migrate creates users, qris_scans, and kolo_topups tables", async (t) => {
  t.after(() => getPool().end());
  await migrate();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'qris_scans', 'kolo_topups')`
  );
  assert.equal(rows.length, 3);

  const { rows: userColumns } = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
  );
  const userColumnNames = userColumns.map((r) => r.column_name);
  for (const expected of ["id", "stellar_public_key", "kolo_stellar_address", "created_at"]) {
    assert.ok(userColumnNames.includes(expected), `missing column: ${expected}`);
  }

  const { rows: orderTable } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders'`
  );
  assert.equal(orderTable.length, 0, "orders table should be dropped");
});
