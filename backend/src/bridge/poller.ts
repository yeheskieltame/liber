// backend/src/bridge/poller.ts
import { getPool } from "../db/pool.js";
import { getBridgeStatus as defaultGetBridgeStatus } from "./allbridge.js";
import { transition } from "../orders/state-machine.js";
import { updateOrderState } from "../orders/repository.js";

const STALE_THRESHOLD_SECONDS = 300; // 5 minutes — give the bridge normal time before checking for failure

export async function pollBridgingOrders(
  deps: { getBridgeStatus: typeof defaultGetBridgeStatus } = { getBridgeStatus: defaultGetBridgeStatus }
): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT id, stellar_tx_hash FROM orders WHERE state = 'bridging' AND stellar_tx_hash IS NOT NULL AND updated_at < now() - interval '${STALE_THRESHOLD_SECONDS} seconds'`
  );

  for (const order of rows) {
    const status = await deps.getBridgeStatus(order.stellar_tx_hash);
    if (status === "failed") {
      const failedState = transition("bridging", "failure");
      await updateOrderState(order.id, failedState, { failure_reason: "Bridge transaction failed on-chain" });
    }
    // "confirmed"/"pending": leave alone — completion is driven by IDRX webhook reconciliation (Task 11), not this poller.
  }
}
