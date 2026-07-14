// backend/src/orders/repository.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { insertOrder } from "./repository.js";

before(async () => {
  await migrate();
});

async function insertTestUser(): Promise<string> {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO users (stellar_public_key, idrx_deposit_address, provider) VALUES ($1, $2, $3) RETURNING id`,
    [
      `GTESTUSER${Math.random().toString(36).slice(2)}`,
      // Randomized: users.idrx_deposit_address has its own partial unique
      // index (see schema.sql), unrelated to what this file is testing.
      `0xDEPOSIT${Math.random().toString(36).slice(2)}`,
      "other",
    ]
  );
  return rows[0].id;
}

test("insertOrder rejects a second non-terminal order for the same user with a Postgres unique violation", async () => {
  // This calls the repository function directly, bypassing routes/orders.ts
  // entirely (including its app-level SELECT pre-check), to prove the DB
  // constraint (orders_one_in_flight_per_user, schema.sql) is what actually
  // prevents a second in-flight order for the same user — not just the
  // route's check-then-act guard, which two truly-concurrent requests could
  // both pass before either INSERT lands.
  const userId = await insertTestUser();

  const orderParams = {
    userId,
    qrContent: "irrelevant-for-this-test",
    merchantName: "Warung Kopi Asa",
    merchantCity: "Jakarta",
    amountIdr: "32000",
    amountUsdc: "2.02",
    rateIdrPerUsdc: "16000",
    quoteExpiresAt: new Date(Date.now() + 30_000),
    fromAccountAddress: "GFROMACCOUNT...",
  };

  // insertOrder always creates rows in 'quoted' — a non-terminal state — so
  // the first call establishes the in-flight order the second call must
  // collide with.
  const first = await insertOrder(orderParams);
  assert.ok(first.id);
  assert.equal(first.state, "quoted");

  await assert.rejects(
    () => insertOrder(orderParams),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "23505");
      return true;
    }
  );
});
