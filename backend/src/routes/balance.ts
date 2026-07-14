// backend/src/routes/balance.ts
import { Hono } from "hono";
import { Horizon } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import { getRateIdrPerUsdc as defaultGetRateIdrPerUsdc } from "../quote/quote.js";

export interface BalanceRouteDeps {
  loadUsdcBalance: typeof loadUsdcBalance;
  getRateIdrPerUsdc: typeof defaultGetRateIdrPerUsdc;
}

const defaultDeps: BalanceRouteDeps = {
  loadUsdcBalance,
  getRateIdrPerUsdc: defaultGetRateIdrPerUsdc,
};

export async function loadUsdcBalance(stellarPublicKey: string): Promise<string> {
  const server = new Horizon.Server(process.env.HORIZON_URL ?? "https://horizon.stellar.org");
  const account = await server.loadAccount(stellarPublicKey);
  const usdcLine = account.balances.find(
    (b): b is Horizon.HorizonApi.BalanceLineAsset =>
      "asset_code" in b && b.asset_code === "USDC" && b.asset_issuer === process.env.USDC_ISSUER
  );
  return usdcLine?.balance ?? "0";
}

export function createBalanceRoute(deps: Partial<BalanceRouteDeps> = {}): Hono {
  const { loadUsdcBalance, getRateIdrPerUsdc } = { ...defaultDeps, ...deps };
  const balanceRoute = new Hono();

  balanceRoute.get("/users/:id/balance", async (c) => {
    const { rows } = await getPool().query(`SELECT stellar_public_key FROM users WHERE id = $1`, [c.req.param("id")]);
    const user = rows[0];
    if (!user) return c.json({ error: "user not found" }, 404);

    const [usdcBalance, rate] = await Promise.all([
      loadUsdcBalance(user.stellar_public_key),
      getRateIdrPerUsdc(),
    ]);

    return c.json({
      usdcBalance,
      idrEstimate: Math.round(Number(usdcBalance) * rate).toString(),
    });
  });

  return balanceRoute;
}

export const balanceRoute = createBalanceRoute();
