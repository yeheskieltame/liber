// backend/src/routes/history.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";

export const historyRoute = new Hono();

historyRoute.get("/users/:id/history", async (c) => {
  const userId = c.req.param("id");

  const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
  if (!userRows[0]) return c.json({ error: "user not found" }, 404);

  const [{ rows: scans }, { rows: topups }] = await Promise.all([
    getPool().query(
      `SELECT id, merchant_name, merchant_city, amount_idr, amount_usdc, created_at
       FROM qris_scans WHERE user_id = $1`,
      [userId]
    ),
    getPool().query(
      `SELECT id, amount_usdc, stellar_tx_hash, created_at
       FROM kolo_topups WHERE user_id = $1`,
      [userId]
    ),
  ]);

  const entries = [
    ...scans.map((r) => ({
      type: "scan" as const,
      id: r.id,
      merchantName: r.merchant_name,
      merchantCity: r.merchant_city,
      amountIdr: r.amount_idr,
      amountUsdc: r.amount_usdc,
      createdAt: r.created_at,
    })),
    ...topups.map((r) => ({
      type: "topup" as const,
      id: r.id,
      amountUsdc: r.amount_usdc,
      stellarTxHash: r.stellar_tx_hash,
      createdAt: r.created_at,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return c.json({ entries });
});
