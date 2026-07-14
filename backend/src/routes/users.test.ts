// backend/src/routes/users.test.ts
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { getPool } from "../db/pool.js";
import { migrate } from "../db/migrate.js";
import { createUsersRoute } from "./users.js";

before(async () => {
  await migrate();
});

test("POST /users onboards with IDRX, funds the account, and returns an unsigned trustline tx", async () => {
  const stellarPublicKey = `GNEWUSER${Math.random().toString(36).slice(2)}`;
  const submittedXdrs: string[] = [];

  const app = createUsersRoute({
    onboardUser: async () => ({
      id: 1011,
      apiKey: "user-api-key",
      apiSecret: Buffer.from("user-secret").toString("base64"),
      fullname: "Test User",
    }),
    addBankAccount: async () => ({ depositWalletAddress: "0xDEPOSIT..." }),
    buildOnboardingTx: async () => ({ signedXdr: "FAKE_FUNDING_XDR" }),
    buildTrustlineTx: async () => ({ unsignedXdr: "FAKE_TRUSTLINE_XDR" }),
    // The route submits the funding tx synchronously before returning. A real
    // submitStellarTx would hit Horizon over the network with a bogus XDR
    // string here, so it's stubbed like every other externally-calling dep.
    submitStellarTx: async (signedXdr: string) => {
      submittedXdrs.push(signedXdr);
    },
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stellarPublicKey,
      email: "user@example.com",
      fullname: "Test User",
      address: "Jakarta",
      idNumber: "1234567890",
      idFileBase64: Buffer.from("fake-image-bytes").toString("base64"),
      bankAccountNumber: "081234567890",
      bankCode: "GOPAY",
      provider: "gopay",
    }),
  });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.unsignedTrustlineXdr, "FAKE_TRUSTLINE_XDR");
  assert.ok(body.userId);
  assert.deepEqual(submittedXdrs, ["FAKE_FUNDING_XDR"]);

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT stellar_public_key, idrx_user_id, idrx_api_key, idrx_api_secret, idrx_deposit_address, provider
     FROM users WHERE id = $1`,
    [body.userId]
  );
  assert.equal(rows[0].stellar_public_key, stellarPublicKey);
  assert.equal(rows[0].idrx_user_id, 1011);
  assert.equal(rows[0].idrx_api_key, "user-api-key");
  assert.equal(rows[0].idrx_api_secret, Buffer.from("user-secret").toString("base64"));
  assert.equal(rows[0].idrx_deposit_address, "0xDEPOSIT...");
  assert.equal(rows[0].provider, "gopay");
});

test("POST /users returns a clear error response (not an unhandled crash) when a post-onboarding step throws", async () => {
  const stellarPublicKey = `GNEWUSER${Math.random().toString(36).slice(2)}`;

  const app = createUsersRoute({
    onboardUser: async () => ({
      id: 2022,
      apiKey: "user-api-key",
      apiSecret: Buffer.from("user-secret").toString("base64"),
      fullname: "Test User",
    }),
    addBankAccount: async () => ({ depositWalletAddress: "0xDEPOSIT..." }),
    buildOnboardingTx: async () => {
      throw new Error("Horizon: could not build funding tx (simulated failure)");
    },
  });

  const res = await app.request("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stellarPublicKey,
      email: "user@example.com",
      fullname: "Test User",
      address: "Jakarta",
      idNumber: "1234567890",
      idFileBase64: Buffer.from("fake-image-bytes").toString("base64"),
      bankAccountNumber: "081234567890",
      bankCode: "GOPAY",
      provider: "gopay",
    }),
  });

  assert.equal(res.status, 502);
  const body = await res.json();
  assert.match(body.error, /simulated failure/);

  const pool = getPool();
  const { rows } = await pool.query(`SELECT id FROM users WHERE stellar_public_key = $1`, [stellarPublicKey]);
  assert.equal(rows.length, 0);
});

test("POST /users/:id/confirm-trustline submits the signed trustline tx and returns ready", async () => {
  const pool = getPool();
  const { rows } = await pool.query(`INSERT INTO users (stellar_public_key) VALUES ($1) RETURNING id`, [
    `GCONFIRMUSER${Math.random().toString(36).slice(2)}`,
  ]);
  const userId = rows[0].id;

  const submittedXdrs: string[] = [];
  const app = createUsersRoute({
    submitStellarTx: async (signedXdr: string) => {
      submittedXdrs.push(signedXdr);
    },
  });

  const res = await app.request(`/users/${userId}/confirm-trustline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedXdr: "SIGNED_TRUSTLINE_XDR" }),
  });

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { ready: true });
  assert.deepEqual(submittedXdrs, ["SIGNED_TRUSTLINE_XDR"]);
});
