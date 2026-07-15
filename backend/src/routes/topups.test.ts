// backend/src/routes/topups.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { topupsRoute } from "./topups.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GTOPUPUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

test("POST /users/:id/topups logs a top-up and returns its id", async () => {
  const userId = await insertTestUser();

  const res = await topupsRoute.request(`/users/${userId}/topups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsdc: "5.00", stellarTxHash: "hash1" }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);

  const pool = getPool();
  const { rows } = await pool.query(`SELECT amount_usdc, stellar_tx_hash FROM kolo_topups WHERE id = $1`, [body.id]);
  assert.equal(rows[0].amount_usdc, "5.00");
  assert.equal(rows[0].stellar_tx_hash, "hash1");
});

test("POST /users/:id/topups returns 404 for an unknown user", async () => {
  const res = await topupsRoute.request("/users/00000000-0000-0000-0000-000000000000/topups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountUsdc: "5.00", stellarTxHash: "hash1" }),
  });

  assert.equal(res.status, 404);
});
