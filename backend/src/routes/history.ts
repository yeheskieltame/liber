// backend/src/routes/history.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const historyRoute = new Hono();

historyRoute.get("/users/:id/orders", async (c) => {
  const userId = c.req.param("id");

  // Check that user exists
  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const { rows } = await getPool().query(
    `SELECT id, merchant_name, merchant_city, amount_idr, amount_usdc, state, stellar_tx_hash, created_at
     FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return c.json({
    orders: rows.map((r) => ({
      orderId: r.id,
      merchantName: r.merchant_name,
      merchantCity: r.merchant_city,
      amountIdr: r.amount_idr,
      amountUsdc: r.amount_usdc,
      state: r.state,
      stellarTxHash: r.stellar_tx_hash,
      createdAt: r.created_at,
    })),
  });
});
