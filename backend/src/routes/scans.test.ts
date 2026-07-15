// backend/src/routes/scans.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { scansRoute } from "./scans.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GSCANUSER${Math.random().toString(36).slice(2)}`,
  ]);
  return rows[0].id;
}

test("POST /users/:id/scans logs a scan and returns its id", async () => {
  const userId = await insertTestUser();

  const res = await scansRoute.request(`/users/${userId}/scans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      merchantName: "Warung Kopi Asa",
      merchantCity: "Jakarta",
      amountIdr: "32000",
      amountUsdc: "2.02",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.ok(body.id);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT merchant_name, merchant_city, amount_idr, amount_usdc FROM qris_scans WHERE id = $1`,
    [body.id]
  );
  assert.equal(rows[0].merchant_name, "Warung Kopi Asa");
  assert.equal(rows[0].merchant_city, "Jakarta");
  assert.equal(rows[0].amount_idr, "32000");
  assert.equal(rows[0].amount_usdc, "2.02");
});

test("POST /users/:id/scans returns 404 for an unknown user", async () => {
  const res = await scansRoute.request("/users/00000000-0000-0000-0000-000000000000/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merchantName: "X", merchantCity: "Y", amountIdr: "1000", amountUsdc: "0.06" }),
  });

  assert.equal(res.status, 404);
});
