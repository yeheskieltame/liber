// backend/src/routes/orders.ts
import { Hono } from "hono";
import { parseQRIS } from "../qris/parser.js";
import { getQuote } from "../quote/quote.js";
import { transition } from "../orders/state-machine.js";
import { insertOrder, getOrder, getOrderWithProvider, updateOrderState } from "../orders/repository.js";
import { buildBridgeTx, submitBridgeTx } from "../bridge/allbridge.js";
import { buildEwalletHandoff } from "../deeplink/builder.js";
import { getPool } from "../db/pool.js";

export const ordersRoute = new Hono();

ordersRoute.post("/orders", async (c) => {
  const { userId, qrContent } = await c.req.json<{ userId: string; qrContent: string }>();

  const { rows } = await getPool().query(`SELECT idrx_deposit_address, stellar_public_key FROM users WHERE id = $1`, [userId]);
  const user = rows[0];
  if (!user) return c.json({ error: "user not found" }, 404);

  const parsed = parseQRIS(qrContent);
  if (!parsed.amount && !c.req.query("amountIdr")) {
    return c.json({ error: "static QRIS requires amountIdr query param" }, 400);
  }
  const amountIdr = Number(parsed.amount ?? c.req.query("amountIdr"));

  const quote = await getQuote(amountIdr);
  const order = await insertOrder({
    userId,
    qrContent,
    merchantName: parsed.merchantName,
    merchantCity: parsed.merchantCity,
    amountIdr: amountIdr.toString(),
    amountUsdc: quote.amountUsdc,
    quoteExpiresAt: quote.expiresAt,
    fromAccountAddress: user.stellar_public_key,
  });

  const { unsignedXdr } = await buildBridgeTx({
    fromAccountAddress: user.stellar_public_key,
    toAccountAddress: user.idrx_deposit_address,
    amountUsdc: quote.amountUsdc,
  });

  return c.json(
    {
      orderId: order.id,
      merchantName: order.merchant_name,
      merchantCity: order.merchant_city,
      amountIdr: order.amount_idr,
      amountUsdc: order.amount_usdc,
      quoteExpiresAt: quote.expiresAt,
      unsignedBridgeXdr: unsignedXdr,
    },
    201
  );
});

ordersRoute.post("/orders/:id/approve", async (c) => {
  const id = c.req.param("id");
  const { signedXdr } = await c.req.json<{ signedXdr: string }>();

  const order = await getOrder(id);
  if (!order) return c.json({ error: "order not found" }, 404);

  const approvedState = transition(order.state, "user_approved");
  await updateOrderState(id, approvedState);

  try {
    const { hash } = await submitBridgeTx(signedXdr, order.from_account_address);
    const bridgingState = transition(approvedState, "bridge_submitted");
    await updateOrderState(id, bridgingState, { stellar_tx_hash: hash });
    return c.json({ state: bridgingState, stellarTxHash: hash });
  } catch (err) {
    const failedState = transition(approvedState, "failure");
    await updateOrderState(id, failedState, { failure_reason: (err as Error).message });
    return c.json({ state: failedState, error: (err as Error).message }, 502);
  }
});

ordersRoute.get("/orders/:id", async (c) => {
  const order = await getOrderWithProvider(c.req.param("id"));
  if (!order) return c.json({ error: "order not found" }, 404);
  return c.json({
    state: order.state,
    merchantName: order.merchant_name,
    amountIdr: order.amount_idr,
    amountUsdc: order.amount_usdc,
    stellarTxHash: order.stellar_tx_hash,
    failureReason: order.failure_reason,
    ewalletHandoff: buildEwalletHandoff(order.provider, order.qr_content),
  });
});
