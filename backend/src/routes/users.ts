// backend/src/routes/users.ts
import { Hono } from "hono";
import { getPool } from "../db/pool.js";
import { onboardUser as defaultOnboardUser, addBankAccount as defaultAddBankAccount } from "../idrx/client.js";
import { buildOnboardingTx as defaultBuildOnboardingTx, buildTrustlineTx as defaultBuildTrustlineTx } from "../stellar/account.js";

export interface UsersRouteDeps {
  onboardUser: typeof defaultOnboardUser;
  addBankAccount: typeof defaultAddBankAccount;
  buildOnboardingTx: typeof defaultBuildOnboardingTx;
  buildTrustlineTx: typeof defaultBuildTrustlineTx;
  /**
   * Submits a signed tx to Horizon. Both POST /users (the funding tx) and
   * POST /users/:id/confirm-trustline (the trustline tx) call this
   * synchronously, so it must be injectable like every other dep here —
   * otherwise tests would either hit real Horizon or fail parsing a fake XDR.
   * Defaults to the real Horizon submission in production.
   */
  submitStellarTx: typeof defaultSubmitStellarTx;
}

const defaultDeps: UsersRouteDeps = {
  onboardUser: defaultOnboardUser,
  addBankAccount: defaultAddBankAccount,
  buildOnboardingTx: defaultBuildOnboardingTx,
  buildTrustlineTx: defaultBuildTrustlineTx,
  submitStellarTx: defaultSubmitStellarTx,
};

const STARTING_BALANCE_XLM = "1.5"; // covers base reserve (~1 XLM) + USDC trustline reserve (~0.5 XLM)

export function createUsersRoute(deps: Partial<UsersRouteDeps> = {}): Hono {
  const { onboardUser, addBankAccount, buildOnboardingTx, buildTrustlineTx, submitStellarTx } = {
    ...defaultDeps,
    ...deps,
  };
  const usersRoute = new Hono();

  usersRoute.post("/users", async (c) => {
    const body = await c.req.json<{
      stellarPublicKey: string;
      email: string;
      fullname: string;
      address: string;
      idNumber: string;
      idFileBase64: string;
      bankAccountNumber: string;
      bankCode: string;
      provider: "gopay" | "dana" | "ovo" | "other";
    }>();

    const businessConfig = {
      baseUrl: process.env.IDRX_BASE_URL!,
      apiKey: process.env.IDRX_API_KEY!,
      apiSecret: process.env.IDRX_API_SECRET!,
    };

    const idFile = new Blob([Buffer.from(body.idFileBase64, "base64")], { type: "image/jpeg" });
    const onboarded = await onboardUser(businessConfig, {
      email: body.email,
      fullname: body.fullname,
      address: body.address,
      idNumber: body.idNumber,
      idFile,
    });

    const userConfig = { baseUrl: businessConfig.baseUrl, apiKey: onboarded.apiKey, apiSecret: onboarded.apiSecret };
    const { depositWalletAddress } = await addBankAccount(userConfig, {
      bankAccountNumber: body.bankAccountNumber,
      bankCode: body.bankCode,
    });

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

    const { rows } = await getPool().query(
      `INSERT INTO users (stellar_public_key, idrx_user_id, idrx_api_key, idrx_api_secret, idrx_deposit_address, provider)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [body.stellarPublicKey, onboarded.id, onboarded.apiKey, onboarded.apiSecret, depositWalletAddress, body.provider]
    );

    return c.json({ userId: rows[0].id, unsignedTrustlineXdr }, 201);
  });

  usersRoute.post("/users/:id/confirm-trustline", async (c) => {
    const { signedXdr } = await c.req.json<{ signedXdr: string }>();
    await submitStellarTx(signedXdr);
    return c.json({ ready: true });
  });

  return usersRoute;
}

async function defaultSubmitStellarTx(signedXdr: string): Promise<void> {
  const { Horizon, TransactionBuilder } = await import("@stellar/stellar-sdk");
  const server = new Horizon.Server(process.env.HORIZON_URL ?? "https://horizon.stellar.org");
  const tx = TransactionBuilder.fromXDR(signedXdr, process.env.STELLAR_NETWORK_PASSPHRASE!);
  await server.submitTransaction(tx);
}

export const usersRoute = createUsersRoute();
