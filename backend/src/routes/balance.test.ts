// backend/src/routes/balance.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createBalanceRoute } from "./balance.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`,
    [`GBALANCEUSER${Math.random().toString(36).slice(2)}`]
  );
  return rows[0].id;
}

test("GET /users/:id/balance returns USDC balance and an IDR estimate", async () => {
  const userId = await insertTestUser();

  const app = createBalanceRoute({
    loadUsdcBalance: async () => "12.5",
    getRateIdrPerUsdc: async () => 16000,
  });

  const res = await app.request(`/users/${userId}/balance`);

  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { usdcBalance: "12.5", idrEstimate: "200000" });
});

test("GET /users/:id/balance returns 404 when the user does not exist", async () => {
  const app = createBalanceRoute({
    loadUsdcBalance: async () => {
      throw new Error("should not be called");
    },
    getRateIdrPerUsdc: async () => {
      throw new Error("should not be called");
    },
  });

  const res = await app.request("/users/00000000-0000-0000-0000-000000000000/balance");

  assert.equal(res.status, 404);
});
