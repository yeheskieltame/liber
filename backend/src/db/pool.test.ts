import { test } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "./pool.js";
import { migrate } from "./migrate.js";

test("migrate creates users and orders tables", async () => {
  await migrate();
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'orders')`
  );
  assert.equal(rows.length, 2);
});
