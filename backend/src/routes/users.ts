// backend/src/routes/users.ts
import { Hono } from "hono";
import { StrKey } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import {
  buildOnboardingTx as defaultBuildOnboardingTx,
  buildTrustlineTx as defaultBuildTrustlineTx,
  submitStellarTx as defaultSubmitStellarTx,
} from "../stellar/account.js";

export interface UsersRouteDeps {
  buildOnboardingTx: typeof defaultBuildOnboardingTx;
  buildTrustlineTx: typeof defaultBuildTrustlineTx;
  submitStellarTx: typeof defaultSubmitStellarTx;
}

const defaultDeps: UsersRouteDeps = {
  buildOnboardingTx: defaultBuildOnboardingTx,
  buildTrustlineTx: defaultBuildTrustlineTx,
  submitStellarTx: defaultSubmitStellarTx,
};

const STARTING_BALANCE_XLM = "2"; // base reserve (~1 XLM) + USDC trustline reserve (~0.5 XLM) + fee buffer for the user's own future transactions (e.g. Kolo top-ups)

export function createUsersRoute(deps: Partial<UsersRouteDeps> = {}): Hono {
  const { buildOnboardingTx, buildTrustlineTx, submitStellarTx } = { ...defaultDeps, ...deps };
  const usersRoute = new Hono();

  usersRoute.post("/users", async (c) => {
    const body = await c.req.json<{ stellarPublicKey: string }>();

    try {
      const { signedXdr: fundingXdr } = await buildOnboardingTx({
        fundingSecret: process.env.FUNDING_SECRET_KEY!,
        newAccountPublicKey: body.stellarPublicKey,
        startingBalanceXlm: STARTING_BALANCE_XLM,
      });
      // The funding tx is signed only by the backend's own funding key (the source
      // account), so it can be submitted immediately without any user signature.
      await submitStellarTx(fundingXdr);

      const { unsignedXdr: unsignedTrustlineXdr } = await buildTrustlineTx({
        accountPublicKey: body.stellarPublicKey,
      });

      const { rows } = await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
        body.stellarPublicKey,
      ]);

      return c.json({ userId: rows[0].id, unsignedTrustlineXdr }, 201);
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  usersRoute.post("/users/:id/confirm-trustline", async (c) => {
    const { signedXdr } = await c.req.json<{ signedXdr: string }>();
    await submitStellarTx(signedXdr);
    return c.json({ ready: true });
  });

  usersRoute.post("/users/:id/kolo-address", async (c) => {
    const { koloStellarAddress } = await c.req.json<{ koloStellarAddress: string }>();
    if (!StrKey.isValidEd25519PublicKey(koloStellarAddress)) {
      return c.json({ error: "koloStellarAddress must be a valid Stellar public key" }, 400);
    }

    const { rows } = await getPool().query(
      `UPDATE users SET kolo_stellar_address = $2 WHERE id = $1 RETURNING id`,
      [c.req.param("id"), koloStellarAddress]
    );
    if (!rows[0]) return c.json({ error: "user not found" }, 404);

    return c.json({ koloStellarAddress });
  });

  usersRoute.get("/users/by-key/:stellarPublicKey", async (c) => {
    const stellarPublicKey = c.req.param("stellarPublicKey");
    if (!StrKey.isValidEd25519PublicKey(stellarPublicKey)) {
      return c.json({ error: "stellarPublicKey must be a valid Stellar public key" }, 400);
    }

    const { rows } = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
    if (!rows[0]) return c.json({ error: "user not found" }, 404);

    return c.json({ userId: rows[0].id });
  });

  return usersRoute;
}

export const usersRoute = createUsersRoute();
