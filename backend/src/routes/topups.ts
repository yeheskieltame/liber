// backend/src/routes/topups.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const topupsRoute = new Hono();

topupsRoute.post("/users/:id/topups", async (c) => {
  const userId = c.req.param("id");
  const { amountUsdc, stellarTxHash } = await c.req.json<{ amountUsdc: string; stellarTxHash: string }>();

  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const { rows } = await getPool().query(
    `INSERT INTO kolo_topups (user_id, amount_usdc, stellar_tx_hash) VALUES ($1, $2, $3) RETURNING id`,
    [userId, amountUsdc, stellarTxHash]
  );

  return c.json({ id: rows[0].id }, 201);
});
