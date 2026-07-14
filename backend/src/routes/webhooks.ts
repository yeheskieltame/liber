// backend/src/routes/webhooks.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { getRedeemByTransferTxHash as defaultGetRedeemByTransferTxHash } from "../idrx/client.js";
import { transition } from "../orders/state-machine.js";
import { updateOrderState } from "../orders/repository.js";

export interface WebhooksRouteDeps {
  getRedeemByTransferTxHash: typeof defaultGetRedeemByTransferTxHash;
  /**
   * Test-only hook. reconcile() runs fire-and-forget (the route responds
   * before it settles), so tests that assert on post-reconciliation DB state
   * have no other way to know when it's done. Left unset in production.
   */
  onReconciled?: () => void;
}

const defaultDeps: WebhooksRouteDeps = { getRedeemByTransferTxHash: defaultGetRedeemByTransferTxHash };

export function createWebhooksRoute(deps: Partial<WebhooksRouteDeps> = {}): Hono {
  const { getRedeemByTransferTxHash, onReconciled } = { ...defaultDeps, ...deps };
  const webhooksRoute = new Hono();

  webhooksRoute.post("/webhooks/idrx", async (c) => {
    const payload = await c.req
      .json<{ depositRedeemRequest?: { transferTxHash?: string }; txHash?: string }>()
      .catch(() => ({}) as { depositRedeemRequest?: { transferTxHash?: string }; txHash?: string });

    // The webhook is untrusted and unretried (spec §10.4) — respond fast,
    // reconcile asynchronously against the real API. Only the transferTxHash
    // is taken from the payload; everything else (status, address) comes
    // from the trusted re-query below.
    const transferTxHash = payload.depositRedeemRequest?.transferTxHash ?? payload.txHash;
    if (transferTxHash) {
      reconcile(transferTxHash).catch((err) => console.error("reconcile failed", err)).finally(() => onReconciled?.());
    }

    return c.json({ received: true });
  });

  async function reconcile(transferTxHash: string): Promise<void> {
    const businessConfig = {
      baseUrl: process.env.IDRX_BASE_URL!,
      apiKey: process.env.IDRX_API_KEY!,
      apiSecret: process.env.IDRX_API_SECRET!,
    };

    const record = await getRedeemByTransferTxHash(businessConfig, transferTxHash);
    if (!record || record.status !== "SUCCESS") return;

    const { rows: userRows } = await getPool().query(`SELECT id FROM users WHERE idrx_deposit_address = $1`, [record.address]);
    const user = userRows[0];
    if (!user) return;

    const { rows: orderRows } = await getPool().query(
      `SELECT id, state FROM orders WHERE user_id = $1 AND state IN ('bridging', 'redeeming') ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    let order = orderRows[0];
    if (!order) return;

    if (order.state === "bridging") {
      const redeemingState = transition(order.state, "bridge_confirmed");
      await updateOrderState(order.id, redeemingState);
      order = { ...order, state: redeemingState };
    }
    if (order.state === "redeeming") {
      const completedState = transition(order.state, "idrx_redeemed");
      await updateOrderState(order.id, completedState);
    }
  }

  return webhooksRoute;
}

export const webhooksRoute = createWebhooksRoute();
