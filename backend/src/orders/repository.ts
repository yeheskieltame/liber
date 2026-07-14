// backend/src/orders/repository.ts
import { getPool } from "../db/pool.js";
import type { OrderState } from "./state-machine.js";

export interface OrderRow {
  id: string;
  user_id: string;
  qr_content: string;
  merchant_name: string;
  merchant_city: string;
  amount_idr: string;
  amount_usdc: string | null;
  quote_expires_at: Date | null;
  state: OrderState;
  from_account_address: string;
  stellar_tx_hash: string | null;
  failure_reason: string | null;
}

export async function insertOrder(params: {
  userId: string;
  qrContent: string;
  merchantName: string;
  merchantCity: string;
  amountIdr: string;
  amountUsdc: string;
  rateIdrPerUsdc: string;
  quoteExpiresAt: Date;
  fromAccountAddress: string;
}): Promise<OrderRow> {
  const { rows } = await getPool().query<OrderRow>(
    `INSERT INTO orders (user_id, qr_content, merchant_name, merchant_city, amount_idr, amount_usdc, quote_rate, quote_expires_at, from_account_address, state)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'quoted')
     RETURNING *`,
    [
      params.userId,
      params.qrContent,
      params.merchantName,
      params.merchantCity,
      params.amountIdr,
      params.amountUsdc,
      params.rateIdrPerUsdc,
      params.quoteExpiresAt,
      params.fromAccountAddress,
    ]
  );
  return rows[0];
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const { rows } = await getPool().query<OrderRow>(`SELECT * FROM orders WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getOrderWithProvider(
  id: string
): Promise<(OrderRow & { provider: "gopay" | "dana" | "ovo" | "other" }) | null> {
  const { rows } = await getPool().query(
    `SELECT o.*, u.provider FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function updateOrderState(
  id: string,
  state: OrderState,
  extra: Partial<Pick<OrderRow, "stellar_tx_hash" | "failure_reason">> = {}
): Promise<void> {
  await getPool().query(
    `UPDATE orders SET state = $2, stellar_tx_hash = COALESCE($3, stellar_tx_hash), failure_reason = COALESCE($4, failure_reason), updated_at = now() WHERE id = $1`,
    [id, state, extra.stellar_tx_hash ?? null, extra.failure_reason ?? null]
  );
}
