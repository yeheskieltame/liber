// backend/src/routes/users.ts
import { Hono } from "hono";
import { StrKey } from "@stellar/stellar-sdk";
import { getPool } from "../db/pool.js";
import {
  buildTrustlineTx as defaultBuildTrustlineTx,
  submitStellarTx as defaultSubmitStellarTx,
  getNativeBalance as defaultGetNativeBalance,
  isActivated,
} from "../stellar/account.js";

export interface UsersRouteDeps {
  buildTrustlineTx: typeof defaultBuildTrustlineTx;
  submitStellarTx: typeof defaultSubmitStellarTx;
  getNativeBalance: typeof defaultGetNativeBalance;
}

const defaultDeps: UsersRouteDeps = {
  buildTrustlineTx: defaultBuildTrustlineTx,
  submitStellarTx: defaultSubmitStellarTx,
  getNativeBalance: defaultGetNativeBalance,
};

export function createUsersRoute(deps: Partial<UsersRouteDeps> = {}): Hono {
  const { buildTrustlineTx, submitStellarTx, getNativeBalance } = { ...defaultDeps, ...deps };
  const usersRoute = new Hono();

  usersRoute.post("/users", async (c) => {
    const body = await c.req.json<{ stellarPublicKey: string }>();

    try {
      const existing = await getPool().query(`SELECT id FROM users WHERE stellar_public_key = $1`, [
        body.stellarPublicKey,
      ]);
      if (existing.rows[0]) {
        const { unsignedXdr: unsignedTrustlineXdr } = await buildTrustlineTx({
          accountPublicKey: body.stellarPublicKey,
        });
        return c.json({ userId: existing.rows[0].id, unsignedTrustlineXdr }, 200);
      }

      const nativeBalance = await getNativeBalance(body.stellarPublicKey);
      if (!isActivated(nativeBalance)) {
        return c.json({ status: "awaiting_funding" }, 202);
      }

      const { unsignedXdr: unsignedTrustlineXdr } = await buildTrustlineTx({
        accountPublicKey: body.stellarPublicKey,
      });

      const { rows } = await getPool().query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
        body.stellarPublicKey,
      ]);

      return c.json({ userId: rows[0].id, unsignedTrustlineXdr }, 201);
    } catch (err) {
      console.error("[users] " + (err as Error).message);
      return c.json({ error: (err as Error).message }, 502);
    }
  });

  usersRoute.post("/users/:id/confirm-trustline", async (c) => {
    const userId = c.req.param("id");

    let signedXdr: string;
    try {
      ({ signedXdr } = await c.req.json<{ signedXdr: string }>());
    } catch {
      return c.json({ error: "Request body must be valid JSON with a signedXdr field." }, 400);
    }

    const { rows } = await getPool().query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!rows[0]) return c.json({ error: "user not found" }, 404);

    try {
      await submitStellarTx(signedXdr);
      return c.json({ ready: true });
    } catch (err) {
      console.error(
        "[confirm-trustline] " + (err as Error).message,
        JSON.stringify((err as { response?: { data?: unknown } })?.response?.data ?? {})
      );
      return c.json({ error: "Couldn't finish setting up your wallet. Please try again." }, 502);
    }
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
