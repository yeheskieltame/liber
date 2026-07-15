// backend/src/routes/orders.ts
import { Hono } from "hono";
import { parseQRIS } from "../qris/parser.js";
import { getQuote as defaultGetQuote } from "../quote/quote.js";
import { transition, InvalidTransitionError } from "../orders/state-machine.js";
import { insertOrder, getOrder, updateOrderState } from "../orders/repository.js";
import { buildPaymentTx as defaultBuildPaymentTx, submitStellarTx as defaultSubmitStellarTx } from "../stellar/account.js";
import { getPool } from "../db/pool.js";

export interface OrdersRouteDeps {
  getQuote: typeof defaultGetQuote;
  buildPaymentTx: typeof defaultBuildPaymentTx;
  submitStellarTx: typeof defaultSubmitStellarTx;
}

const defaultDeps: OrdersRouteDeps = {
  getQuote: defaultGetQuote,
  buildPaymentTx: defaultBuildPaymentTx,
  submitStellarTx: defaultSubmitStellarTx,
};

export function createOrdersRoute(deps: Partial<OrdersRouteDeps> = {}): Hono {
  const { getQuote, buildPaymentTx, submitStellarTx } = { ...defaultDeps, ...deps };
  const ordersRoute = new Hono();

  ordersRoute.post("/orders", async (c) => {
    const { userId, qrContent } = await c.req.json<{ userId: string; qrContent: string }>();

    const { rows } = await getPool().query(`SELECT stellar_public_key FROM users WHERE id = $1`, [userId]);
    const user = rows[0];
    if (!user) return c.json({ error: "user not found" }, 404);

    const { rows: inFlightRows } = await getPool().query(
      `SELECT id FROM orders WHERE user_id = $1 AND state NOT IN ('completed', 'failed') LIMIT 1`,
      [userId]
    );
    if (inFlightRows[0]) {
      return c.json({ error: "an order is already in progress for this user" }, 409);
    }

    const parsed = parseQRIS(qrContent);
    if (!parsed.amount && !c.req.query("amountIdr")) {
      return c.json({ error: "static QRIS requires amountIdr query param" }, 400);
    }
    const amountIdr = Number(parsed.amount ?? c.req.query("amountIdr"));
    if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
      return c.json({ error: "amountIdr must be a positive number" }, 400);
    }

    const quote = await getQuote(amountIdr);
    let order;
    try {
      order = await insertOrder({
        userId,
        qrContent,
        merchantName: parsed.merchantName,
        merchantCity: parsed.merchantCity,
        amountIdr: amountIdr.toString(),
        amountUsdc: quote.amountUsdc,
        rateIdrPerUsdc: quote.rateIdrPerUsdc,
        quoteExpiresAt: quote.expiresAt,
        fromAccountAddress: user.stellar_public_key,
      });
    } catch (err) {
      // Belt-and-suspenders: the SELECT-based check above is a cheap
      // pre-check that avoids quote/parse work in the common case, but it's
      // check-then-act and can't close a race between two truly-concurrent
      // requests. The orders_one_in_flight_per_user partial unique index
      // (schema.sql) is the actual enforcement; map its violation to the
      // same 409 rather than letting it surface as an unhandled 500.
      if ((err as { code?: string }).code === "23505") {
        return c.json({ error: "an order is already in progress for this user" }, 409);
      }
      throw err;
    }

    const { unsignedXdr } = await buildPaymentTx({
      fromAccountAddress: user.stellar_public_key,
      destinationPublicKey: process.env.TREASURY_PUBLIC_KEY!,
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
        unsignedPaymentXdr: unsignedXdr,
      },
      201
    );
  });

  ordersRoute.post("/orders/:id/approve", async (c) => {
    const id = c.req.param("id");
    const { signedXdr } = await c.req.json<{ signedXdr: string }>();

    const order = await getOrder(id);
    if (!order) return c.json({ error: "order not found" }, 404);

    let approvedState;
    try {
      approvedState = transition(order.state, "user_approved");
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
    await updateOrderState(id, approvedState);

    try {
      const { hash } = await submitStellarTx(signedXdr);
      const settlementState = transition(approvedState, "payment_submitted");
      await updateOrderState(id, settlementState, { stellar_tx_hash: hash });
      return c.json({ state: settlementState, stellarTxHash: hash });
    } catch (err) {
      const failedState = transition(approvedState, "failure");
      await updateOrderState(id, failedState, { failure_reason: (err as Error).message });
      return c.json({ state: failedState, error: (err as Error).message }, 502);
    }
  });

  ordersRoute.post("/orders/:id/settle", async (c) => {
    // ponytail: plain string compare, not constant-time. Fine for a
    // single-operator hackathon demo; upgrade to a timing-safe compare if
    // this admin route is ever exposed beyond the operator's own tooling.
    if (c.req.header("x-admin-secret") !== process.env.ADMIN_SECRET) {
      return c.json({ error: "forbidden" }, 403);
    }

    const order = await getOrder(c.req.param("id"));
    if (!order) return c.json({ error: "order not found" }, 404);

    try {
      const completedState = transition(order.state, "settled");
      await updateOrderState(order.id, completedState);
      return c.json({ state: completedState });
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        return c.json({ error: err.message }, 409);
      }
      throw err;
    }
  });

  ordersRoute.get("/orders/:id", async (c) => {
    const order = await getOrder(c.req.param("id"));
    if (!order) return c.json({ error: "order not found" }, 404);
    return c.json({
      state: order.state,
      merchantName: order.merchant_name,
      amountIdr: order.amount_idr,
      amountUsdc: order.amount_usdc,
      stellarTxHash: order.stellar_tx_hash,
      failureReason: order.failure_reason,
    });
  });

  return ordersRoute;
}

export const ordersRoute = createOrdersRoute();
