// backend/src/routes/webhooks.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getTransactionHistory as defaultGetTransactionHistory } from "../idrx/client.js";
import { transition } from "../orders/state-machine.js";
import { updateOrderState } from "../orders/repository.js";

export interface WebhooksRouteDeps {
  getTransactionHistory: typeof defaultGetTransactionHistory;
  /**
   * Test-only hook. reconcile() runs fire-and-forget (the route responds
   * before it settles), so tests that assert on post-reconciliation DB state
   * have no other way to know when it's done. Left unset in production.
   */
  onReconciled?: (merchantOrderId: string) => void;
}

const defaultDeps: WebhooksRouteDeps = {
  getTransactionHistory: defaultGetTransactionHistory,
};

export function createWebhooksRoute(deps: Partial<WebhooksRouteDeps> = {}): Hono {
  const { getTransactionHistory, onReconciled } = { ...defaultDeps, ...deps };
  const webhooksRoute = new Hono();

  async function reconcile(merchantOrderId: string) {
    const { rows } = await getPool().query(
      `SELECT o.id, o.state, u.idrx_api_key, u.idrx_api_secret
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.idrx_merchant_order_id = $1`,
      [merchantOrderId]
    );
    const order = rows[0];
    if (!order) return;

    const history = await getTransactionHistory(
      { baseUrl: process.env.IDRX_BASE_URL!, apiKey: order.idrx_api_key, apiSecret: order.idrx_api_secret },
      merchantOrderId
    );

    if (history?.status === "MINTED") {
      const nextState = transition(order.state, "idrx_redeemed");
      await updateOrderState(order.id, nextState);
    }
  }

  webhooksRoute.post("/webhooks/idrx", async (c) => {
    const payload = await c.req.json<{ merchantOrderId?: string }>().catch(() => ({}) as { merchantOrderId?: string });

    // Fire-and-forget reconciliation: respond fast (webhook has no retry and no
    // signature — spec §10.4), verify against the real API before trusting anything.
    if (payload.merchantOrderId) {
      const merchantOrderId = payload.merchantOrderId;
      reconcile(merchantOrderId)
        .catch((err) => console.error("reconcile failed", err))
        .finally(() => onReconciled?.(merchantOrderId));
    }

    return c.json({ received: true });
  });

  return webhooksRoute;
}

export const webhooksRoute = createWebhooksRoute();
